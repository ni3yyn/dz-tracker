import { normalizeAlgerianPhone, safeLower, normalizeDiacritics } from '../utils/safe';
import type { TrackingEvent } from '../index';

const STATUS: Record<string, [string, string, string]> = {
  '1':['processing','تم تسجيل الطرد لدى Zimou','تم تسجيل الطرد في نظام Zimou.'],
  '2':['processing','الطرد جاهز للإرسال','الطرد جاهز لبدء عملية الشحن.'],
  '3':['dispatched','تم استلام الطرد للشحن','بدأت عملية نقل الطرد عبر شبكة Zimou.'],
  '4':['in_transit','الطرد في الطريق إلى الولاية','الطرد في طريقه إلى مركز التوزيع بالولاية.'],
  '5':['in_transit','وصل الطرد إلى مركز التوزيع','وصل الطرد إلى مركز التوزيع.'],
  '6':['in_transit','الطرد قيد التحويل','يجري نقل الطرد بين مراكز التوزيع.'],
  '7':['out_for_delivery','خرج الطرد للتوصيل','الطرد مع مندوب التوصيل.'],
  '8':['delivered','تم تسليم الطرد بنجاح','أكدت Zimou تسليم الطرد.'],
  '9':['attempt_failed','تعذرت محاولة التوصيل','لم تنجح محاولة توصيل الطرد.'],
  '10':['attempt_failed','تنبيه على الشحنة','سجلت Zimou تنبيهاً على الشحنة.'],
  '11':['postponed','تم تأجيل التوصيل','تم تأجيل موعد توصيل الطرد.'],
  '12':['processing','الطرد قيد الانتظار','الطرد ينتظر استكمال إجراءات الشحن.'],
  '13':['attempt_failed','فشلت محاولة التوصيل الأولى','لم تنجح محاولة التوصيل الأولى.'],
  '14':['attempt_failed','فشلت محاولة التوصيل الثانية','لم تنجح محاولة التوصيل الثانية.'],
  '15':['attempt_failed','فشلت محاولة التوصيل الثالثة','لم تنجح محاولة التوصيل الثالثة.'],
  '16':['returning','الطرد في طريق العودة','بدأت إعادة الطرد إلى مركز التوزيع.'],
  '17':['returning','وصل المرتجع إلى المركز','وصل الطرد المرتجع إلى مركز التوزيع.'],
  '18':['ready_for_pickup','المرتجع جاهز للاستلام','الطرد المرتجع جاهز للاستلام من المركز.'],
  '19':['returning','الطرد عائد إلى المتجر','الطرد في طريق العودة إلى المتجر.'],
  '20':['returned','تم إرجاع الطرد إلى المتجر','تم تسليم الطرد المرتجع إلى المتجر.'],
  '21':['in_transit','الطرد لدى شركة شريكة','تم تحويل الطرد إلى شركة توصيل شريكة.'],
  '22':['attempt_failed','رفض العميل استلام الطرد','سجلت Zimou رفض استلام الطرد.'],
  '23':['dispatched','تم استلام الطرد','تم استلام الطرد من نقطة الإرسال.'],
  '24':['in_transit','الطرد قيد التوزيع','الطرد قيد التوزيع على شبكة الشحن.'],
  '25':['in_transit','تم تحويل الطرد','تم تحويل الطرد إلى مركز التوزيع التالي.'],
  '26':['processing','الطرد قيد التجهيز بالمخزن','الطرد قيد التجهيز في المخزن.'],
  '27':['attempt_failed','المنتج غير متوفر بالمخزن','سجلت Zimou عدم توفر المنتج بالمخزن.'],
  '28':['processing','الطرد جاهز بالمخزن','الطرد جاهز في المخزن.'],
  '29':['returned','تم إرجاع الطرد بالمخزن','تم تسجيل إرجاع الطرد في المخزن.'],
  '30':['cancelled','طلب إلغاء الطرد','تم طلب إلغاء الطرد.'],
  '31':['cancelled','تم إلغاء الطرد','تم إلغاء الطرد لدى Zimou.'],
  '32':['attempt_failed','الطرد المرتجع تالف','سجلت Zimou تلف الطرد المرتجع.'],
  '33':['processing','الطرد لم يُستلم بعد','لم يتم استلام الطرد من المتجر بعد.'],
  '34':['processing','طلب الدروبشيب قيد التجهيز','طلب الدروبشيب قيد التجهيز.'],
  '35':['processing','طلب الدروبشيب جاهز','طلب الدروبشيب جاهز للشحن.'],
  '36':['ready_for_pickup','طلب التبادل جاهز للاستلام','طلب التبادل جاهز للاستلام.'],
  '37':['returned','تم إرجاع طلب الدروبشيب','تم إرجاع طلب الدروبشيب.'],
  '38':['attempt_failed','طلب الدروبشيب المرتجع تالف','سجلت Zimou تلف المرتجع.'],
  '39':['dispatched','تم استلام طلب التبادل','تم استلام الطرد الخاص بالتبادل.'],
  '40':['in_transit','وصل الطرد إلى المركز','وصل الطرد إلى مركز التوزيع.'],
  '41':['cancelled','طلب إلغاء الدروبشيب','تم طلب إلغاء الدروبشيب.'],
  '42':['cancelled','تم إلغاء الدروبشيب','تم إلغاء الدروبشيب.'],
  '43':['processing','الشحنة قيد التجهيز','الشحنة قيد التجهيز.'],
  '44':['processing','الشحنة جاهزة للإرسال','الشحنة جاهزة للإرسال.'],
  '45':['cancelled','طلب إلغاء الشحنة','تم طلب إلغاء الشحنة.'],
  '46':['cancelled','تم إلغاء الشحنة','تم إلغاء الشحنة.'],
  '83':['attempt_failed','الشحنة محظورة','سجلت Zimou حظر الشحنة.'],
  '112':['in_transit','جاري تحديد موقع الشحنة','يجري تحديد موقع الشحنة.'],
  '113':['out_for_delivery','الشحنة جاهزة للمندوب','أصبحت الشحنة جاهزة للمندوب.'],
  '114':['in_transit','الشحنة في مرحلة النقل','الشحنة في مرحلة النقل.'],
  '115':['in_transit','وصلت الشحنة إلى المركز','وصلت الشحنة إلى مركز التوزيع.'],
  '116':['returning','الطرد في طريق العودة للمركز','بدأ مسار الإرجاع إلى المركز.'],
  '118':['attempt_failed','تعذر العثور على الشحنة','سجلت Zimou أن الشحنة مفقودة.'],
};

function first(...values: unknown[]): string {
  for (const value of values) if (typeof value === 'string' || typeof value === 'number') {
    const result = String(value).trim(); if (result) return result;
  }
  return '';
}

const STATUS_NAME_IDS: Record<string, string> = {
  'en preparation':'1', 'pret a expedier':'2', 'en attente':'12',
  'pas encore ramassé':'33', 'expedie':'3', 'pickup':'23', 'echange collecté':'39',
  'vers wilaya ( sac )':'4', 'centre ( hub )':'5', 'transfert (sac)':'6',
  'societe partenaire':'21', 'en dispatche':'24', 'dispatche':'25', 'au centre':'40',
  'en localisation':'112', 'en transit':'114', 'en hub':'115',
  'sortie en livraison':'7', 'pret pour livreur':'113', 'livre':'8',
  'echec de livraison':'9', 'reporter (date)':'11', 'tentative echouee 1':'13',
  'tentative echouee 2':'14', 'tentative echouee 3':'15', 'refuse':'22',
  'retour vers centre':'16', 'retournee au centre':'17', 'retour vers vendeur (sac)':'19',
  'retour (station)':'116', 'retournee au vendeur (sac)':'20', 'warehouse retournee':'29',
  'dropships retournee':'37', 'retour a retirer':'18', 'echange a retirer':'36',
  'alert':'10', 'warehouse hors stock':'27', 'bloque':'83', 'perdu':'118',
  'annulee':'31', 'annule':'31',
};

export function mapZimouStatus(value: unknown, statusName?: unknown) {
  const named = first(statusName);
  if (named) {
    const normalizedName = normalizeDiacritics(safeLower(named));
    const nameId = STATUS_NAME_IDS[normalizedName];
    const namedRow = nameId ? STATUS[nameId] : undefined;
    if (namedRow) return { statusRaw: namedRow[0], statusTitle: namedRow[1], description: namedRow[2] };
    return { statusRaw:'unknown', statusTitle:'تحديث جديد من Zimou (' + named + ')', description:'وصلت حالة غير معروفة من Zimou: ' + named + '. لم يتم تخمين معناها.' };
  }
  const raw = first(value);
  const row = STATUS[raw];
  if (row) return { statusRaw: row[0], statusTitle: row[1], description: row[2] };
  const normalized = normalizeDiacritics(safeLower(raw));
  const nameId = STATUS_NAME_IDS[normalized];
  const alias = nameId ? STATUS[nameId] : undefined;
  if (alias) return { statusRaw: alias[0], statusTitle: alias[1], description: alias[2] };
  return { statusRaw:'unknown', statusTitle: raw ? 'تحديث جديد من Zimou (' + raw + ')' : 'تحديث جديد من Zimou', description: raw ? 'وصلت حالة غير معروفة من Zimou: ' + raw + '. لم يتم تخمين معناها.' : 'وصل تحديث دون رمز حالة معروف.' };
}

export class ZimouAdapter {
  static normalize(merchantId: string, rawPayload: unknown): TrackingEvent {
    const root = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload) ? rawPayload as Record<string, any> : {};
    const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root;
    const mapped = mapZimouStatus(data.status_id ?? data.status, data.status_name);
    const tracking = first(data.tracking_code, data.tracking, data.tracking_number, data.code_suivi);
    const packageId = first(data.id, data.package_id);
    const external = first(data.order_id, data.external_order_id, data.reference) || tracking || (packageId ? 'ZIMOU-' + packageId : '');
    const partner = first(data.tracking_partner_company, data.partner_company, data.delivery_company);
    const partnerTracking = first(data.delivery_company_tracking_code, data.partner_tracking_code);
    const customerName = [first(data.client_first_name, data.first_name), first(data.client_last_name, data.last_name)].filter(Boolean).join(' ') || first(data.client_name, data.customer_name, data.name);
    return {
      merchantId,
      externalOrderId: external || tracking || 'ZIMOU-' + (packageId || 'UNKNOWN'),
      customerName: customerName || undefined,
      customerPhone: normalizeAlgerianPhone(first(data.client_phone, data.phone)) || undefined,
      productName: first(data.name, data.product_description, data.product_name) || undefined,
      statusRaw: mapped.statusRaw,
      statusTitle: mapped.statusTitle,
      description: [mapped.description, partner ? 'شركة التوصيل الشريكة: ' + partner : '', partnerTracking ? 'رقم تتبع الشريك: ' + partnerTracking : ''].filter(Boolean).join(' — '),
      carrierName: 'Zimou Express',
      sourceProvider: 'zimou',
      carrierTrackingNumber: tracking || undefined,
      carrierOrderId: packageId || undefined,
      carrierMetadata: {
        zimouPackageId: packageId || null,
        zimouTrackingCode: tracking || null,
        partnerCompany: partner || null,
        partnerTrackingCode: partnerTracking || null,
        statusId: data.status_id ?? null,
        statusName: first(data.status_name, data.status) || null,
        wilaya: first(data.wilaya_name, data.wilaya) || null,
        commune: first(data.commune?.name, data.commune) || null,
        address: first(data.address) || null,
        deliveryPrice: data.delivery_price ?? null,
        codAmount: data.price ?? null,
        deliveryType: first(data.delivery_type_name, data.delivery_type) || null,
        updatedAt: first(data.updated_at) || null,
      },
    };
  }
}
