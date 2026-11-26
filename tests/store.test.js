import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.js';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-test-'));const s=createStore(root);t.after(()=>{s.db.close();fs.rmSync(root,{recursive:true,force:true});});return s;}
test('workspace search isolates confidential documents',t=>{const s=fixture(t);s.save('professional',{title:'Confidential launch',content:'secret telescope launch'});s.save('personal',{title:'Reading',content:'telescope notes'});assert.equal(s.search('personal','telescope').length,1);assert.equal(s.search('anne','telescope').length,0);assert.throws(()=>s.search('../other','secret'));});
test('existing edits require approval and retain version history',t=>{const s=fixture(t);const d=s.save('personal',{title:'Plan',content:'First draft'});assert.throws(()=>s.save('personal',{...d,content:'changed'}),/Approval/);assert.throws(()=>s.save('anne',{...d,content:'leaked'},true),/not found/);const edited=s.save('personal',{...d,content:'Approved'},true);assert.equal(edited.version,2);assert.equal(s.db.prepare('SELECT content FROM versions WHERE document=?').get(d.id).content,'First draft');});
test('watcher imports without renaming or changing original files',t=>{const s=fixture(t);const file=path.join(s.directory('personal'),'README.md');fs.writeFileSync(file,'# Research\nLocal embeddings');s.scan('personal');s.scan('personal');assert.equal(fs.readFileSync(file,'utf8'),'# Research\nLocal embeddings');assert.equal(s.search('personal','embeddings').length,1);fs.writeFileSync(file,'Updated knowledge');s.scan('personal');assert.equal(s.search('personal','embeddings').length,0);assert.equal(s.search('personal','knowledge').length,1);});
test('symbolic links cannot expose outside content',t=>{const s=fixture(t);const file=path.join(s.directory('personal'),'outside.md');fs.symlinkSync('/etc/passwd',file);s.scan('personal');assert.equal(s.db.prepare('SELECT count(*) AS n FROM documents').get().n,0);});
test('full text query punctuation is safe',t=>{const s=fixture(t);s.save('personal',{title:'Plan',content:'design systems'});assert.doesNotThrow(()=>s.search('personal','" OR *; --'));assert.equal(s.search('personal','design').length,1);});
