// Re-creates media/*.webp masters from the Cargo originals with correct colour (ICC → sRGB)
import sharp from 'sharp'; import fs from 'fs'; import path from 'path';
const map=JSON.parse(fs.readFileSync(process.argv[2]));
let n=0, before=0, after=0;
await Promise.all(Array.from({length:6},async(_,k)=>{ for(let i=k;i<map.length;i+=6){ const [o,r]=map[i];
  const out='media/'+r.replace(/\.\w+$/,'.webp'); if(fs.existsSync(out)) before+=fs.statSync(out).size;
  await sharp(o).rotate().resize({width:2560,withoutEnlargement:true,kernel:'lanczos3'}).toColourspace('srgb').webp({quality:98,smartSubsample:true,effort:6}).toFile(out);
  after+=fs.statSync(out).size; n++; }}));
console.log(n,'masters', (before/1e6).toFixed(1)+'MB ->', (after/1e6).toFixed(1)+'MB');
