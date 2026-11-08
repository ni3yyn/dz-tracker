import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PushWorkerConfig } from './config.js';
import { decryptEcomV2Credentials } from './ecom-v2-credentials.js';

const API = 'https://ecom-dz.com/api_v2';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1200;
const TIMEOUT_MS = 15000;
type Integration = { id:string; merchant_id:string; credentials_encrypted:string; sync_enabled:boolean };
type Order = { external_order_id:string; customer_name:string|null; customer_phone:string|null; product_name:string|null; carrier_tracking_number:string; current_status:string };
function textValue(v:unknown):string{return v==null?'':String(v).trim();}
export function createEcomV2EventId(tracking:string,event:Record<string,any>):string{
  return createHash('sha256').update([tracking,event.date,event.situation,event.commentaire,event.etat_logistique].map(textValue).join('|')).digest('hex');
}
function historyFrom(body:any):Record<string,any>[] {
  return Array.isArray(body?.historique) ? body.historique.filter((x:any)=>x&&typeof x==='object') : [];
}
function dateValue(v:unknown):number {
  const raw=textValue(v); if(!raw)return 0;
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(match){const [,y,m,d,h='00',min='00',s='00']=match;return new Date(y+'-'+m+'-'+d+'T'+h+':'+min+':'+s+'+01:00').getTime();}
  const n=new Date(raw).getTime();return Number.isFinite(n)?n:0;
}
const NOTE=new Set(['','encours','biz','suivi par e-com','information','type de colis','type de livraison']);
function normalizeSituation(value:unknown):string{return textValue(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export class EcomV2SyncWorker {
  private readonly supabase:SupabaseClient;
  private readonly instanceId=randomUUID();
  private running=false;
  private lastRequestAt=0;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private wake:(()=>void)|null=null;
  private readonly intervalMs:number;
  constructor(private readonly config:PushWorkerConfig){
    this.intervalMs=Math.max(60_000,config.ecomV2SyncIntervalMs||DEFAULT_INTERVAL_MS);
    this.supabase=createClient(config.supabaseUrl,config.supabaseSecretKey,{auth:{autoRefreshToken:false,persistSession:false}});
  }
  async start():Promise<void>{
    if(this.running)return;this.running=true;
    console.log('[EcomV2Sync]: Worker '+this.instanceId.slice(0,8)+' started; cycle='+this.intervalMs+'ms.');
    while(this.running){await this.runCycle();if(this.running)await new Promise<void>(resolve=>{
      this.wake=resolve;this.timer=setTimeout(()=>{this.timer=null;this.wake=null;resolve();},this.intervalMs);
    });}
  }
  stop():void{this.running=false;if(this.timer)clearTimeout(this.timer);this.timer=null;this.wake?.();this.wake=null;}
  private async runCycle():Promise<void>{
    const {data,error}=await (this.supabase as any).from('merchant_carrier_integrations')
      .select('id,merchant_id,credentials_encrypted,sync_enabled').eq('provider','ecom_v2').eq('sync_enabled',true);
    if(error){console.error('[EcomV2Sync]: Could not load accounts:',error.message);return;}
    for(const row of (data||[]) as Integration[]){if(!this.running)return;await this.syncAccount(row);}
  }
  private async rateLimit():Promise<void>{
    const wait=Math.max(0,MIN_REQUEST_INTERVAL_MS-(Date.now()-this.lastRequestAt));
    if(wait)await new Promise(r=>setTimeout(r,wait));this.lastRequestAt=Date.now();
  }
  private async syncAccount(integration:Integration):Promise<void>{
    let auth:{apiKey:string;apiToken:string}|null=null;
    try{
      if(!this.config.credentialsEncryptionKey)throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing.');
      auth=decryptEcomV2Credentials(integration.credentials_encrypted,integration.merchant_id,this.config.credentialsEncryptionKey);
      const {data:merchant,error:merchantError}=await (this.supabase as any).from('merchants').select('api_key').eq('id',integration.merchant_id).maybeSingle();
      if(merchantError||!merchant?.api_key)throw new Error('Merchant API key could not be loaded.');
      let offset=0,checked=0,ingested=0;
      while(this.running){
        const {data:orders,error}=await (this.supabase as any).from('orders')
          .select('external_order_id,customer_name,customer_phone,product_name,carrier_tracking_number,current_status')
          .eq('merchant_id',integration.merchant_id).eq('carrier_name','E-com Delivery v2')
          .not('carrier_tracking_number','is',null).order('created_at',{ascending:false}).range(offset,offset+199);
        if(error)throw new Error('Could not load E-com Delivery v2 tracking records: '+error.message);
        const batch=(orders||[]) as Order[];
        for(const order of batch){
          if(!this.running)return;
          if(!order.carrier_tracking_number||['delivered','returned','cancelled'].includes(textValue(order.current_status).toLowerCase()))continue;
          await this.rateLimit();
          const url=new URL('colis/'+encodeURIComponent(order.carrier_tracking_number),API+'/');
          let response:Response;
          try{response=await fetch(url,{headers:{Accept:'application/json','X-API-Key':auth.apiKey,'X-API-Token':auth.apiToken},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(TIMEOUT_MS)});}
          catch(e:any){throw new Error(e?.name==='TimeoutError'||e?.name==='AbortError'?'E-com Delivery tracking request timed out.':'E-com Delivery tracking request could not reach the API.');}
          if(response.status===404)continue;
          if(response.status===401||response.status===403)throw new Error('E-com Delivery rejected the saved KEY or Token. Reconnect the account.');
          if(response.status===429)throw new Error('E-com Delivery rate limit reached; the next cycle will retry.');
          let body:any;try{body=await response.json();}catch{throw new Error('E-com Delivery returned invalid JSON (HTTP '+response.status+').');}
          if(!response.ok||body?.error)throw new Error('E-com Delivery status request failed (HTTP '+response.status+').');
          // The provider's track endpoint returns its authoritative event history. Do not
          // invent a current timestamp when history is empty; that would create a new event on
          // every polling cycle and could spam the customer's timeline.
          const history=historyFrom(body).sort((a,b)=>dateValue(a.date)-dateValue(b.date));
          const useful=history.filter(x=>!NOTE.has(normalizeSituation(x.situation)) && dateValue(x.date) > 0);
          if (!useful.length) { checked++; continue; }
          const events=useful.map((event,index)=>({
            ...event,tracking:order.carrier_tracking_number,id_externe:order.external_order_id,
            nom_complet:order.customer_name||'',mobile_1:order.customer_phone||'',article:order.product_name||'',
            source_event_id:createEcomV2EventId(order.carrier_tracking_number,event),
            suppressTriggers:index<useful.length-1,
          }));
          for(let i=0;i<events.length;i+=50){
            const res=await fetch(this.config.trackingPublicBaseUrl.replace(/\/+$/,'')+'/api/webhooks/ecom-v2/sync',{
              method:'POST',headers:{'Content-Type':'application/json','x-api-key':merchant.api_key},
              body:JSON.stringify({events:events.slice(i,i+50)}),signal:AbortSignal.timeout(TIMEOUT_MS),
            });
            let result:any=null;try{result=await res.json();}catch{}
            if(!res.ok||result?.success!==true)throw new Error('TajerTrack E-com v2 ingestion failed: '+textValue(result?.error||result?.message||('HTTP '+res.status)));
            ingested+=events.slice(i,i+50).length;
          }
          checked++;
        }
        offset+=200;if(batch.length<200)break;
      }
      const now=new Date().toISOString();
      const {error:updateError}=await (this.supabase as any).from('merchant_carrier_integrations')
        .update({last_sync_at:now,last_success_at:now,last_error:null,last_error_at:null,updated_at:now}).eq('id',integration.id);
      if(updateError)throw new Error('Could not save E-com Delivery v2 sync state: '+updateError.message);
      console.log('[EcomV2Sync]: Merchant '+integration.merchant_id.slice(0,8)+' checked '+checked+' known tracking numbers; sent '+ingested+' history events.');
    }catch(e:any){
      const message=String(e?.message||'E-com Delivery v2 synchronization failed').replaceAll(auth?.apiKey||'','[redacted]').replaceAll(auth?.apiToken||'','[redacted]').slice(0,500);
      console.error('[EcomV2Sync]: Account '+integration.merchant_id.slice(0,8)+' failed: '+message);
      await (this.supabase as any).from('merchant_carrier_integrations')
        .update({last_sync_at:new Date().toISOString(),last_error:message,last_error_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',integration.id);
    }finally{auth=null;}
  }
}
