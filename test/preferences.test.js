import test from 'node:test';
import assert from 'node:assert/strict';
import {rankByPreference} from '../src/index.js';
test('favourite identity matches slugs, html links and numeric cart IDs', () => {
 const preferences={favorites:[{productId:'milk-brand-123.html',name:'Old label'}]};
 const products=[{product_id:'milk-456',name:'Other milk'},{product_id:'milk-brand-123',name:'New label'}];
 assert.equal(rankByPreference(products,preferences)[0].product_id,'milk-brand-123');
 assert.equal(rankByPreference([{product_id:'123',name:'New label'}],preferences)[0].score,100);
});
