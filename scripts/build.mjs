import {mkdir,copyFile,rm} from 'node:fs/promises';
const paths=['index.html','src/game.js','src/styles.css','assets/icon.svg','assets/icon-192.png','assets/icon-512.png','manifest.webmanifest','sw.js'];
await rm('www',{recursive:true,force:true});
for(const path of paths){const target=`www/${path}`;await mkdir(target.substring(0,target.lastIndexOf('/')),{recursive:true});await copyFile(path,target);}
console.log(`Packaged ${paths.length} verified local web sources into www/ (Android signing not performed).`);
