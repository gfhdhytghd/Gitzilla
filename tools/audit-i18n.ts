import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pythonClassroomPresets, pythonStarter, pythonClassroomPlan } from '../shared/classroom-presets';
import { LOCALES } from '../shared/i18n/locale';
const sources=JSON.parse(readFileSync('shared/i18n/sources.json','utf8')) as {id:string;source:string;context:string}[];
const rows=JSON.parse(readFileSync('shared/i18n/gemini-translations.json','utf8')) as {id:string;en:string;zh:string;es:string;fr:string}[];
const map=new Map(rows.map(r=>[r.id,r]));const errors:string[]=[],review:{id:string;locale:string;reason:string;source:string;translation:string}[]=[];
const tags=(s:string)=>(s.match(/\{\d+\}/g)??[]).sort().join('|');
for(const source of sources){const row=map.get(source.id);if(!row){errors.push(`Missing ${source.id}`);continue;}
 for(const lang of LOCALES){const value=row[lang];if(!value?.trim()){errors.push(`Empty ${source.id} ${lang}`);continue;}if(tags(value)!==tags(source.source))errors.push(`Placeholder mismatch ${source.id} ${lang}`);
  if(lang!=='zh'&&source.source!=='中文'&&/[\u3400-\u9fff]/.test(value))review.push({id:source.id,locale:lang,reason:'Chinese text remains in a non-Chinese translation',source:source.source,translation:value});
  if(source.context.includes('classroom-presets'))for(const token of ['Hello, Python!','Invalid score','Empty bag','Launch!','Pass','Retry','True','False','add_stock','inventory','even_total','AssertionError'])if(source.source.includes(token)&&!value.includes(token))review.push({id:source.id,locale:lang,reason:`Course token changed: ${token}`,source:source.source,translation:value});
 }
}
const starters=LOCALES.flatMap(lang=>pythonClassroomPresets.map(p=>pythonStarter(p.id,lang)));
execFileSync('python3',['-c','import ast,json,sys\ntrees={}\nfor x in json.load(sys.stdin):\n tree=ast.dump(ast.parse(x["content"],filename=x["filename"]))\n assert x["filename"] not in trees or trees[x["filename"]]==tree, "Translated starter changed executable Python: "+x["filename"]\n trees[x["filename"]]=tree'],{input:JSON.stringify(starters)});
for(const lang of LOCALES)for(const preset of pythonClassroomPresets){const plan=pythonClassroomPlan(preset.id,lang);if(plan.steps.length!==3)errors.push(`Step count ${preset.id}/${lang}`);}
writeFileSync('shared/i18n/review.json',JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify({sources:sources.length,translations:rows.length,errors:errors.length,needsReview:review.length,pythonStartersParsed:starters.length}));
if(errors.length){console.log(errors.slice(0,20).join('\n'));process.exitCode=1;}
