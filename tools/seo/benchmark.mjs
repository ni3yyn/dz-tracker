#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RUNS = join(ROOT, 'benchmark-runs');
const PROMPTS = join(ROOT, 'ai-visibility-prompts.json');
const PLATFORMS = [
  ['chatgpt-search-ui', 'ChatGPT Search'],
  ['google-ai-overviews', 'Google AI Overviews / AI Mode'],
  ['perplexity-ui', 'Perplexity'],
  ['microsoft-copilot-ui', 'Microsoft Copilot'],
];
const BRAND = /tajer\s*track|تاجر\s*تراك|تاجرتراك/iu;
const RIVALS = [['SuiviSMS', /suivi\s*sms/iu], ['Colitrack', /colitrack/iu], ['ECOMANAGER', /eco\s*manager/iu]];
const REVIEW = {
  recommended: ['yes', 'no', 'not_assessed'],
  own_sim_accuracy: ['accurate', 'inaccurate', 'not_mentioned', 'not_applicable', 'not_assessed'],
  exchange_accuracy: ['accurate', 'inaccurate', 'not_mentioned', 'not_applicable', 'not_assessed'],
};
const headers = ['platform_id','platform','query_id','locale','intent','prompt','status','response_text','citation_urls','recommended','own_sim_accuracy','exchange_accuracy','tested_at','tested_by','notes'];

function parseArgs(argv) {
  const action = ['run','import','report','test','help'].includes(argv[0]) ? argv.shift() : 'run', flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const [key, ...value] = argv[i].slice(2).split('=');
    flags[key] = value.length ? value.join('=') : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  }
  return { action, flags };
}
function toCsv(rows) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return [headers.join(','), ...rows.map((row) => headers.map((key) => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}
function fromCsv(input) {
  const rows = [], text = input.replace(/^\uFEFF/, '');
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"' && value === '') quoted = true;
    else if (c === ',') { row.push(value); value = ''; }
    else if (c === '\n') { row.push(value.replace(/\r$/, '')); if (row.some((x) => x !== '')) rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (quoted) throw new Error('CSV has an unmatched quote.');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); if (row.some((x) => x !== '')) rows.push(row); }
  if (!rows.length) throw new Error('CSV is empty.');
  const names = rows.shift().map((x) => x.trim());
  if (new Set(names).size !== names.length) throw new Error('CSV contains duplicate column names.');
  return rows.map((cells, i) => {
    if (cells.length !== names.length) throw new Error('CSV row ' + (i + 2) + ' has the wrong number of fields.');
    return Object.fromEntries(names.map((key, j) => [key, cells[j]]));
  });
}
function normalizeCitation(value, line) {
  let url;
  try { url = new URL(value); } catch { throw new Error('CSV row ' + line + ': invalid citation URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('CSV row ' + line + ': citation must use HTTP(S).');
  return url.toString();
}
function evaluate(answer, citations) {
  const text = String(answer ?? ''), at = text.search(BRAND);
  const competitors = RIVALS.filter(([, re]) => re.test(text)).map(([name]) => name);
  const order = [...(at < 0 ? [] : [{ name: 'TajerTrack', at }]), ...competitors.map((name) => ({ name, at: text.search(RIVALS.find(([n]) => n === name)[1]) }))].sort((a, b) => a.at - b.at);
  const domains = [...new Set(citations.map((x) => new URL(x).hostname.toLowerCase().replace(/^www\./, '')))];
  return { mentioned: at >= 0, brandPosition: at < 0 ? null : order.findIndex((x) => x.name === 'TajerTrack') + 1, competitors, domains, citationPresent: citations.length > 0, brandCitationPresent: domains.includes('tajertrack.vercel.app'), excerpt: (at < 0 ? text.slice(0, 250) : text.slice(Math.max(0, at - 120), at + 220)).replace(/\s+/g, ' ') };
}
async function atomic(path, content) {
  const tmp = path + '.tmp-' + process.pid;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}
async function putJson(path, data) { await atomic(path, JSON.stringify(data, null, 2) + '\n'); }
async function getRun(requested) {
  await mkdir(RUNS, { recursive: true });
  let id = requested;
  if (!id || id === 'latest') {
    const candidates = [];
    for (const entry of await readdir(RUNS, { withFileTypes: true })) if (entry.isDirectory()) {
      try { const m = JSON.parse(await readFile(join(RUNS, entry.name, 'manifest.json'), 'utf8')); candidates.push({ id: entry.name, time: Date.parse(m.createdAt) || 0 }); }
      catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    }
    candidates.sort((a, b) => b.time - a.time); id = candidates[0]?.id;
  }
  if (!id || !/^[a-zA-Z0-9._-]{6,80}$/.test(id)) throw new Error('Run not found. Run seo:benchmark first.');
  const path = resolve(RUNS, id);
  if (!path.startsWith(RUNS + sep)) throw new Error('Invalid run path.');
  await readFile(join(path, 'manifest.json'), 'utf8');
  return { id, path };
}
async function loadResults(path) {
  try {
    return (await readFile(join(path, 'results.jsonl'), 'utf8')).split(/\r?\n/).filter(Boolean).map((line, i) => {
      try { return JSON.parse(line); } catch { throw new Error('Invalid results.jsonl line ' + (i + 1)); }
    });
  } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
const pct = (x) => x == null ? '—' : (x * 100).toFixed(1) + '%';
function calculate(results, planned) {
  return PLATFORMS.map(([platformId, platform]) => {
    const rows = results.filter((x) => x.platformId === platformId), answers = rows.filter((x) => x.status === 'answered');
    const discovery = answers.filter((x) => x.intent === 'category-discovery');
    const rate = (n, d) => d ? n / d : null, count = (key, value) => answers.filter((x) => x.review[key] === value).length;
    return { platformId, platform, planned, captured: rows.length, answered: answers.length,
      unavailable: rows.filter((x) => ['not_available','blocked'].includes(x.status)).length,
      mentioned: answers.filter((x) => x.evaluation.mentioned).length,
      mentionRate: rate(answers.filter((x) => x.evaluation.mentioned).length, answers.length),
      discoveryRate: rate(discovery.filter((x) => x.evaluation.mentioned).length, discovery.length),
      citationRate: rate(answers.filter((x) => x.evaluation.citationPresent).length, answers.length),
      brandCitationRate: rate(answers.filter((x) => x.evaluation.brandCitationPresent).length, answers.length),
      recommendedYes: count('recommended','yes'), recommendedNo: count('recommended','no'),
      ownSimAccurate: count('own_sim_accuracy','accurate'), ownSimInaccurate: count('own_sim_accuracy','inaccurate'),
      exchangeAccurate: count('exchange_accuracy','accurate'), exchangeInaccurate: count('exchange_accuracy','inaccurate') };
  });
}
function safeMd(x) { return String(x ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'\\|').replace(/\s+/g,' ').trim(); }
async function writeReport(id, path, results) {
  const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')), metrics = calculate(results, manifest.promptCount);
  const domains = new Map(), rivals = new Map();
  for (const result of results.filter((x) => x.status === 'answered')) {
    for (const d of result.evaluation.domains) domains.set(d, (domains.get(d) || 0) + 1);
    for (const n of result.evaluation.competitors) rivals.set(n, (rivals.get(n) || 0) + 1);
  }
  const oldRuns = [];
  for (const entry of await readdir(RUNS, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== id) {
    try {
      const old = JSON.parse(await readFile(join(RUNS, entry.name, 'manifest.json'), 'utf8'));
      if (old.promptSetSha256 !== manifest.promptSetSha256) continue;
      const summary = JSON.parse(await readFile(join(RUNS, entry.name, 'summary.json'), 'utf8'));
      oldRuns.push({ id: entry.name, time: Date.parse(old.createdAt) || 0, metrics: summary.metrics });
    } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  }
  oldRuns.sort((a,b) => b.time - a.time);
  const previous = oldRuns[0], lines = [
    '# TajerTrack AI visibility report','',
    '- Run: ' + id, '- Date: ' + manifest.runDate, '- Market: Algeria',
    '- Prompts: ' + manifest.promptCount, '- Prompt-set SHA-256: ' + manifest.promptSetSha256,
    '- Captured records: ' + results.length, '',
    '> This measures consumer-app answers captured by a human tester. It is a dated snapshot, not a ranking guarantee or statistically representative survey. Pending, blocked and unavailable rows are not counted as non-mentions.','',
    '| Platform | Answers / captured / planned | Mentions | Category discovery | Any citations | TajerTrack citations | Recommended yes/no | Own-SIM accurate/inaccurate | Exchange accurate/inaccurate |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const m of metrics) lines.push('| ' + m.platform + ' | ' + m.answered + '/' + m.captured + '/' + m.planned + ' | ' + pct(m.mentionRate) + ' | ' + pct(m.discoveryRate) + ' | ' + pct(m.citationRate) + ' | ' + pct(m.brandCitationRate) + ' | ' + m.recommendedYes + '/' + m.recommendedNo + ' | ' + m.ownSimAccurate + '/' + m.ownSimInaccurate + ' | ' + m.exchangeAccurate + '/' + m.exchangeInaccurate + ' |');
  lines.push('', '## Change vs previous comparable run', '', '| Platform | Previous run | Mention | Category discovery | Citation |', '|---|---|---:|---:|---:|');
  for (const m of metrics) {
    const old = previous?.metrics.find((x) => x.platformId === m.platformId);
    const delta = (a,b) => a == null || b == null ? '—' : (a >= b ? '+' : '') + ((a-b)*100).toFixed(1) + ' pp';
    lines.push('| ' + m.platform + ' | ' + (previous?.id || 'None') + ' | ' + delta(m.mentionRate,old?.mentionRate) + ' | ' + delta(m.discoveryRate,old?.discoveryRate) + ' | ' + delta(m.citationRate,old?.citationRate) + ' |');
  }
  lines.push('', '## Citation domains','');
  if (domains.size) for (const [d,n] of [...domains].sort((a,b)=>b[1]-a[1])) lines.push('- ' + d + ': ' + n + ' answer(s)'); else lines.push('- None captured.');
  lines.push('', '## Competitors mentioned','');
  if (rivals.size) for (const [n,count] of [...rivals].sort((a,b)=>b[1]-a[1])) lines.push('- ' + n + ': ' + count + ' answer(s)'); else lines.push('- None detected.');
  lines.push('', '## Answer evidence','');
  for (const r of results) {
    lines.push('### ' + safeMd(r.queryId) + ' · ' + safeMd(r.platform) + ' · ' + safeMd(r.locale));
    lines.push('- Status: ' + r.status + ' · Mentioned: ' + (r.status === 'answered' ? r.evaluation.mentioned : 'not scored') + ' · first tracked mention: ' + (r.evaluation.brandPosition ?? '—'));
    lines.push('- Prompt: ' + safeMd(r.prompt));
    if (r.evaluation.excerpt) lines.push('> ' + safeMd(r.evaluation.excerpt.slice(0,400)));
    if (r.citations.length) lines.push('- Citations: ' + r.citations.map((x) => '<' + x + '>').join(' · '));
    lines.push('- Human review: recommendation=' + r.review.recommended + '; own-SIM=' + r.review.own_sim_accuracy + '; exchange=' + r.review.exchange_accuracy,'');
  }
  lines.push('', '## Interpretation','', '- Rates use answered rows only.', '- Category discovery excludes prompts that name TajerTrack.', '- Recommendation and product-fact accuracy are human-reviewed; not_assessed is excluded.', '- First tracked mention is position among configured competitors, not a general search rank.', '- Trends compare only identical prompt-set hashes; one run is a directional snapshot.','');
  await putJson(join(path,'summary.json'), { runId:id, generatedAt:new Date().toISOString(), promptCount:manifest.promptCount, promptSetSha256:manifest.promptSetSha256, resultCount:results.length, metrics });
  await atomic(join(path,'report.md'), lines.join('\n'));
}
async function run(flags) {
  const data = JSON.parse(await readFile(PROMPTS,'utf8')), limit = flags.limit ? Number(flags.limit) : data.prompts.length;
  if (!Number.isInteger(limit) || limit < 1 || limit > data.prompts.length) throw new Error('Invalid prompt limit.');
  const prompts = data.prompts.slice(0,limit), date = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Algiers'}).format(new Date());
  const id = String(flags['run-id'] || new Date().toISOString().replace(/[-:.]/g,'').slice(0,15) + '-' + randomUUID().slice(0,8));
  if (!/^[a-zA-Z0-9._-]{6,80}$/.test(id)) throw new Error('Invalid run ID.');
  await mkdir(RUNS,{recursive:true}); const path = join(RUNS,id); await mkdir(path,{recursive:false});
  const manifest = {schemaVersion:1,runId:id,createdAt:new Date().toISOString(),runDate:date,market:'Algeria',site:'https://tajertrack.vercel.app',promptCount:prompts.length,promptSetVersion:data.version ?? 1,promptSetSha256:createHash('sha256').update(JSON.stringify(prompts)).digest('hex')};
  await putJson(join(path,'manifest.json'),manifest); await putJson(join(path,'prompts.json'),prompts);
  const rows = prompts.flatMap((p) => PLATFORMS.map(([platform_id,platform]) => ({platform_id,platform,query_id:p.id,locale:p.locale,intent:p.intent,prompt:p.query,status:'pending',response_text:'',citation_urls:'',recommended:'not_assessed',own_sim_accuracy:'not_assessed',exchange_accuracy:'not_assessed',tested_at:'',tested_by:'',notes:''})));
  await writeFile(join(path,'manual-capture.csv'),toCsv(rows),'utf8'); await writeReport(id,path,[]);
  process.stdout.write('Created ' + id + ': ' + prompts.length + ' prompts × 4 platforms = ' + rows.length + ' rows. Fill manual-capture.csv, then import and report.\n');
  process.stdout.write('Import: pnpm seo:benchmark:import -- --run=' + id + '\nReport: pnpm seo:benchmark:report -- --run=' + id + '\n');
}
async function importResults(flags) {
  const {id,path} = await getRun(String(flags.run || 'latest')), input = resolve(String(flags.file || join(path,'manual-capture.csv')));
  const realInput = await realpath(input), realRun = await realpath(path);
  if (!realInput.startsWith(realRun + sep)) throw new Error('Import file must be inside the selected run directory.');
  const prompts = JSON.parse(await readFile(join(path,'prompts.json'),'utf8')), promptMap = new Map(prompts.map((p)=>[p.id,p]));
  const rows = fromCsv(await readFile(input,'utf8')), required = ['platform_id','query_id','status','response_text','citation_urls',...Object.keys(REVIEW)];
  for (const key of required) if (!(key in (rows[0] || {}))) throw new Error('CSV is missing column: ' + key);
  const results = [], seen = new Set(); let skipped = 0;
  for (let i=0;i<rows.length;i++) {
    const r=rows[i], line=i+2, status=String(r.status || '').trim().toLowerCase();
    if (status==='pending' && !String(r.response_text || '').trim()) {skipped++;continue;}
    const prompt=promptMap.get(r.query_id), platform=PLATFORMS.find(([key])=>key===r.platform_id);
    if (!prompt || !platform) throw new Error('CSV row ' + line + ': unknown prompt or platform ID.');
    if (!['answered','not_available','blocked'].includes(status)) throw new Error('CSV row ' + line + ': invalid status.');
    const answer=String(r.response_text || '').trim(); if(status==='answered' && !answer) throw new Error('CSV row ' + line + ': answer is blank.');
    const citations=[...new Set(String(r.citation_urls || '').split('|').map((x)=>x.trim()).filter(Boolean).map((x)=>normalizeCitation(x,line)))];
    const review={}; for(const [key,allowed] of Object.entries(REVIEW)){review[key]=String(r[key]||'not_assessed').trim().toLowerCase();if(!allowed.includes(review[key]))throw new Error('CSV row '+line+': invalid '+key+'.');}
    const key=prompt.id+':'+platform[0];if(seen.has(key))throw new Error('Duplicate CSV result: '+key);seen.add(key);
    results.push({runId:id,queryId:prompt.id,locale:prompt.locale,intent:prompt.intent,prompt:prompt.query,platformId:platform[0],platform:platform[1],status,answer,citations,collectedAt:r.tested_at||new Date().toISOString(),testedBy:String(r.tested_by||''),notes:String(r.notes||''),review,evaluation:evaluate(answer,citations)});
  }
  const existing=await loadResults(path), keyed=new Map(existing.map((x)=>[x.queryId+':'+x.platformId,x]));
  for(const x of results){const key=x.queryId+':'+x.platformId;if(keyed.has(key)&&!flags.replace)throw new Error('Result exists for '+key+'. Use --replace.');keyed.set(key,x);}
  const all=[...keyed.values()].sort((a,b)=>a.queryId.localeCompare(b.queryId)||a.platformId.localeCompare(b.platformId));
  await atomic(join(path,'results.jsonl'),all.map((x)=>JSON.stringify(x)).join('\n')+(all.length?'\n':''));await writeReport(id,path,all);
  process.stdout.write('Imported '+results.length+'; skipped '+skipped+' pending; total captured '+all.length+'.\n'+join(path,'report.md')+'\n');
}
async function report(flags){const {id,path}=await getRun(String(flags.run||'latest'));const results=await loadResults(path);await writeReport(id,path,results);process.stdout.write('Report updated: '+id+' ('+results.length+' captured).\n'+join(path,'report.md')+'\n');}
function test(){
  const sample = Object.fromEntries(headers.map((key) => [key, key === 'response_text' ? 'one, "quoted"\nnext' : '']));
  const row = fromCsv(toCsv([sample]))[0];
  if (row.response_text !== 'one, "quoted"\nnext') throw new Error('CSV quote/newline test failed.');
  const e = evaluate('SuiviSMS appears before TajerTrack.', ['https://tajertrack.vercel.app/about']);
  if (!e.mentioned || e.brandPosition !== 2 || !e.brandCitationPresent) throw new Error('Brand/citation test failed.');
  if (!evaluate('تاجر تراك للمتاجر', []).mentioned || evaluate('No brand', []).mentioned) throw new Error('Arabic/false-positive test failed.');
  let rejected = false;
  try { normalizeCitation('javascript:alert(1)', 2); } catch { rejected = true; }
  if (!rejected) throw new Error('Unsafe citation URL was accepted.');
  const m = calculate([], 28);
  if (m.length !== 4 || m.some((x) => x.answered || x.captured || x.mentionRate !== null)) throw new Error('Empty denominator test failed.');
  process.stdout.write('PASS: CSV, Arabic/Latin brand matching, competitor order, citation validation and empty-denominator tests.\n');
}
async function main(){const {action,flags}=parseArgs(process.argv.slice(2));if(action==='help')return process.stdout.write('seo:benchmark [-- --limit=7]\nseo:benchmark:import -- --run=ID [--replace]\nseo:benchmark:report -- --run=ID\nseo:benchmark:test\n');if(action==='test')return test();if(action==='import')return importResults(flags);if(action==='report')return report(flags);return run(flags);}
main().catch((e)=>{process.stderr.write('ERROR: '+(e?.message||String(e))+'\n');process.exitCode=1;});
