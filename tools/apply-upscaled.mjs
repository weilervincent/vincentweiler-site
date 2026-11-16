// Writes upscaled PNGs (from tools upscale run) as high-quality WebP masters in media/
import sharp from 'sharp'; import fs from 'fs'; import path from 'path';
const dir=process.argv[2]; let n=0;
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for (const f of walk(dir).filter(f=>f.endsWith('.png'))) {
  const rel=path.relative(dir,f).replace(/\.png$/,'.webp');
  await sharp(f).webp({quality:96,smartSubsample:true,effort:6}).toFile('media/'+rel); n++;
}
console.log(n,'masters updated');
