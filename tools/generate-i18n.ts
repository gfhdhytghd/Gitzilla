/** Development-only Gemini translation job. Runtime translations are bundled; no user text is sent. */
import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { deepseekJson, readProviderSetting, DEEPSEEK_MODEL } from '../design/provider';
import { parseGeneratedJSON } from './i18n-json';
const folders=['client/app','client/edu','client/input','client/genesis','client/render/arena','genesis','rubric','server','auth','sim','analysis'];
const sources=new Map<string,Set<string>>();
function add(source:string,file:string,visible=false){
 // Font declarations and stored control IDs are implementation values, not interface copy.
 if (/^(?:\d+(?:\.\d+)?px\s|"[^"\n]+".*(?:monospace|sans-serif))/.test(source) || source === 'tap-only') return;
 if(source.length<2||source.length>8000||!/[A-Za-z\u3400-\u9fff]/.test(source))return;
 if(/^(?:https?:|\/|\.\.\/|\.\/|[a-z]+\/[^ ]|#[0-9a-f]{3,8}$)/i.test(source)||/[<>][a-z]+[ >]/i.test(source))return;
 if(/^(?:div|span|button|input|p|a|h[1-6]|label|section|select|option|small|strong|details|pre|canvas|textarea)[.#]/.test(source))return;
 if(/^(?:data-|aria-|--|\.[\w-]+[:.#[])/.test(source))return;
 if(!visible&&!/[\s\u3400-\u9fff]/.test(source))return;
 if(/^[\s{}();:,.+*%\d|\[\]\\-]+$/.test(source))return;
 const files=sources.get(source)??new Set();files.add(file);sources.set(source,files);
}
for(const folder of folders)for(const name of readdirSync(folder)){
 if(!name.endsWith('.ts')||/test|demo|browser-check|mock|debug|placeholders|smoke|gallery/.test(name))continue;
 if(folder==='sim'&&!['quality.ts','archetypes.ts','pvp.ts'].includes(name))continue;
 if(folder==='analysis'&&!['classroom.ts','index.ts','github.ts'].includes(name))continue;
 const file=join(folder,name), sf=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(node:ts.Node){
  let value:string|undefined;
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))value=node.text;
  else if(ts.isTemplateExpression(node))value=node.head.text+node.templateSpans.map((s,i)=>`{${i}}${s.literal.text}`).join('');
  if(value!==undefined){let p=node.parent,visible=false;
   for(let i=0;p&&i<5;i++,p=p.parent){
    if(ts.isCallExpression(p)&&['h','button','toast','confirm','prompt','fillText','text','drawText','Error'].includes(p.expression.getText(sf).split('.').at(-1)!)){
     const index=p.arguments.findIndex(a=>node.pos>=a.pos&&node.end<=a.end);const fn=p.expression.getText(sf).split('.').at(-1);
     if((fn==='h'&&index>=2)||(fn!=='h'&&index===0))visible=true;
    }
    if(ts.isPropertyAssignment(p)&&['title','placeholder','aria-label','name','instructions','description','summary','examples','teacherNote','prerequisite','task','boss'].includes(p.name.getText(sf).replace(/["']/g,'')))visible=true;
   }
   add(value,file,visible);
  }
  ts.forEachChild(node,visit);
 }visit(sf);
}
// Content data and short labels that occur outside immediate UI expressions.
for(const name of ['classroom-presets.ts','classroom-defaults.ts']){
 const file='shared/'+name,sf=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n:ts.Node){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))add(n.text,file,true);else if(ts.isTemplateExpression(n))add(n.head.text+n.templateSpans.map((s,i)=>`{${i}}${s.literal.text}`).join(''),file,true);ts.forEachChild(n,visit);}visit(sf);
}
for(const text of ['Language','Classroom language','Only the host can change the classroom language','English','中文','Español','Français','Ready','Leave','Remove','Cancel','Close','Continue','Submit','Start','Pause','Resume','Score','Damage','Boss','Teacher','Student','Loading…','offline','writing code','checking commit…','needs resubmission','学习目标','本步任务','文件与运行','自测示例','记录与提交','评分说明','可以从下面的起始代码开始：','继续修改同一个文件，保留前一步仍需要的功能。','运行成功后，','保存、commit、push 到 GitHub，回课堂提交最新分支。','当前分数是静态提交证据分，不是程序正确率。源码片段和记录通过后，仍需运行上面的示例并请教师复核。正确的等价写法可由教师调整检查。','在仓库创建 {0}，使用 Python 3。运行：python3 {0}。','在仓库根目录的 {0} 中添加本课标题，并记录至少两个案例，每个写“输入 / 预期 / 实际”，再写一句你改进了什么。然后','Python 3 · 运行：python3 {0}','建议课时：30 分钟，三个步骤各 10 分钟；可根据班级情况延长。','前置知识：{0}','备课重点：{0}','第 {0} 步 · {1}','Python 基础 · {0}','检查 {0} 是否存在；不执行代码。','源码片段：{0}（不是运行结果）','Static evidence found','Required evidence not found in the analyzed archive'])add(text,'i18n-explicit',true);
const dir='shared/i18n';mkdirSync(dir,{recursive:true});
const entries=[...sources].map(([source,files])=>({id:createHash('sha256').update(source).digest('hex').slice(0,16),source,context:[...files].join(', ')}));
writeFileSync(join(dir,'sources.json'),JSON.stringify(entries,null,2)+'\n');
const target=join(dir,'gemini-translations.json');
type Row={id:string,en:string,zh:string,es:string,fr:string,provider?:string,model?:string};
const completed=new Map<string,Row>((existsSync(target)?JSON.parse(readFileSync(target,'utf8')):[]).map((r:Row)=>[r.id,r]));
const missing=entries.filter(e=>!completed.has(e.id));
const batches:typeof entries[]=[];let batch:typeof entries=[],size=0;
for(const entry of missing){if(batch.length>=45||size+entry.source.length>8000){batches.push(batch);batch=[];size=0;}batch.push(entry);size+=entry.source.length;}if(batch.length)batches.push(batch);
console.log(JSON.stringify({entries:entries.length,alreadyTranslated:completed.size,batches:batches.length}));
const model='gemini-3.8-flash-high';
const instruction=`You are providing all internationalization text for Gitzilla, a code game and cooperative coding classroom. Translate each input into natural English (en), Simplified Chinese (zh), Spanish (es), French (fr). Return JSON {translations:[{id,en,zh,es,fr}]}. Preserve IDs exactly. Preserve every numbered placeholder such as {0}, including repeated occurrences. NEVER add/remove placeholders. Preserve source English verbatim in en; preserve source Chinese verbatim in zh. Translate surrounding prose but preserve Python identifiers, Python snippets, example program output literals (Hello, Python!, Pass, Retry, Invalid score, Launch!, Empty bag, True, False), file paths, shell commands, URLs, repository names and numeric expected results. Do not translate CSS/class names, code tokens, language names, or product name Gitzilla. Boss means shared game enemy (首领/jefe/boss), Host in classroom means teacher. Do not claim static checks run or prove code correctness. Output concise professional interface text, usable by school students; no commentary. If input is solely code or a technical token, keep it unchanged in all languages. Translate all requested items, including long lesson text and multiline comments. Preserve indentation and valid Python for starter files.`;
function askGemini(prompt: string): Promise<string> {
 return new Promise((resolve,reject)=>{
  const child=spawn('agy',['--model',model,'--mode','plan','--output-format','json','--print',prompt],{stdio:['ignore','pipe','pipe']});
  let stdout='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.resume();
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('AGY translation timed out'));},180000);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error(`AGY exited ${code}`));
   try{const envelope=JSON.parse(stdout);if(envelope.status!=='SUCCESS')throw new Error(`AGY status ${envelope.status}`);resolve(envelope.response);}catch(e){reject(e);}
  });
 });
}
const deepseekKey=await readProviderSetting(process.cwd(),'DEEPSEEK_API_KEY','DEEPSEEK-API-KEY');
const deepseekModel=await readProviderSetting(process.cwd(),'DEEPSEEK_MODEL')??DEEPSEEK_MODEL;
function validateBatch(result: Row[], items: typeof entries): Row[] {
 const ids=new Set(items.map(i=>i.id));if(!Array.isArray(result)||result.length!==items.length)throw new Error('Incomplete batch');
 const valid:Row[]=[];
 for(const row of result){const entry=items.find(i=>i.id===row.id);if(!entry||!ids.delete(row.id))throw new Error('Unexpected/duplicate id');for(const lang of ['en','zh','es','fr'] as const){if(typeof row[lang]!=='string'||!row[lang].trim())throw new Error('Empty translation');const tags=(s:string)=>(s.match(/\{\d+\}/g)??[]).sort().join('|');if(tags(row[lang])!==tags(entry.source))throw new Error(`Placeholder mismatch ${row.id} ${lang}`);}if(/[\u3400-\u9fff]/.test(entry.source))row.zh=entry.source;else row.en=entry.source;valid.push(row);}
 return valid;
}
function saveBatch(valid: Row[], index: number, provider: string, model: string) {
 for(const row of valid)completed.set(row.id,{...row,provider,model});
 writeFileSync(target,JSON.stringify([...completed.values()],null,2)+'\n');
 console.log(JSON.stringify({batch:index+1,of:batches.length,translated:completed.size,provider,model}));
}
let cursor=0,failed=0;
async function worker(){while(cursor<batches.length){const index=cursor++,items=batches[index];let last='';for(let attempt=0;attempt<2;attempt++)try{
 const raw=await askGemini(instruction+'\nDo not use any tools. Translate only this public application text. Return valid JSON with escaped double quotes and newlines inside strings.\n'+(last?`The previous attempt failed validation: ${last}. Correct that issue.\n`:'')+JSON.stringify(items));
 writeFileSync(`/tmp/gitzilla-agy-translations-${index+1}-${attempt+1}.json`,raw);
 const result=(parseGeneratedJSON(raw) as {translations:Row[]}).translations;
 saveBatch(validateBatch(result,items),index,'Gemini via AGY',model);last='';break;
 }catch(e){last=(e as Error).message;console.log(JSON.stringify({batch:index+1,attempt:attempt+1,error:last}));if(/timed out|AGY exited|AGY status/.test(last))break;await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
 if(last&&deepseekKey)try{
  const result=await deepseekJson(instruction+'\nReturn a JSON object with a translations array.\n'+JSON.stringify(items),{apiKey:deepseekKey,model:deepseekModel,timeoutMs:120000,maxTokens:32000}) as {translations:Row[]};
  saveBatch(validateBatch(result.translations,items),index,'DeepSeek',deepseekModel);last='';
 }catch(e){last=(e as Error).message;console.log(JSON.stringify({batch:index+1,provider:'DeepSeek',error:last}));}
 if(last)failed++;
}}
await Promise.all(Array.from({length:6},()=>worker()));
const active=entries.flatMap(e=>{const row=completed.get(e.id);return row?[[row.en,row.zh,row.es,row.fr]]:[];});
const bundled=active.filter(row=>row.some(value=>value!==row[0]));
writeFileSync(join(dir,'messages.generated.json'),JSON.stringify(bundled)+'\n');
const providers=Object.fromEntries(['Gemini via AGY','DeepSeek'].map(p=>[p,entries.filter(e=>completed.has(e.id)&&(completed.get(e.id)?.provider??'Gemini via AGY')===p).length]));
writeFileSync(join(dir,'generation.json'),JSON.stringify({provider:'Gemini via AGY with DeepSeek fallback',model,providers,entries:entries.length,translated:active.length,bundled:bundled.length,failed,generatedAt:new Date().toISOString()},null,2)+'\n');
if(failed)process.exitCode=1;
