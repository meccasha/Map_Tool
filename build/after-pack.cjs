const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async context => {
  if(context.electronPlatformName !== 'win32')return;
  const files=[],dirs=[];
  async function walk(directory,relative='') {
    for(const item of await fs.readdir(directory,{withFileTypes:true})) {
      const name=path.join(relative,item.name);
      if(item.isDirectory()){dirs.push(name);await walk(path.join(directory,item.name),name);}else files.push(name);
    }
  }
  await walk(context.appOutDir);
  const quote=name=>name.replaceAll('/', '\\').replaceAll('$','$$').replaceAll('"','$\\"');
  const lines=files.sort().map(name=>`Delete /REBOOTOK "$INSTDIR\\${quote(name)}"`);
  lines.push(...dirs.sort((a,b)=>b.split(path.sep).length-a.split(path.sep).length).map(name=>`RMDir "$INSTDIR\\${quote(name)}"`));
  await fs.mkdir(path.join(context.packager.projectDir,'build'),{recursive:true});
  await fs.writeFile(path.join(context.packager.projectDir,'build/uninstall-files.nsh'),['!macro AtlasInstallFiles',`File /r "${path.join(context.appOutDir,'*').replaceAll('$','$$').replaceAll('\"','$\\\"')}"`,'!macroend','!macro AtlasUninstallFiles',...lines,'!macroend'].join('\n')+'\n');
};
