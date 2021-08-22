const fs = require('fs-extra');
const path = require('path');

let fileList = [];
class ServiceWorkerWebpackPlugin {
  chacheName=process.cwd().split(path.sep).slice(-1);
  swFile='';
  noCacheFileList=[
    '/', // 首页不能缓存，缓存后其他文件更新，刷新页面不会有效果
    'sw.js',
  ];
  noCacheApiList=[];
  cacheFirstList=[];

  constructor(options={}) {

    options.chacheName && (this.chacheName = options.chacheName);
    options.noCacheFileList && this.noCacheFileList.push(...options.noCacheFileList);
    options.noCacheApiList && this.noCacheApiList.push(...options.noCacheApiList);
    options.cacheFirstList && this.cacheFirstList.push(...options.cacheFirstList);
    fs.readFile(path.resolve(__dirname, './sw.js'), 'utf8', (err, data) => {
      this.swFile = data;
    })
  }
  
  apply(compiler) {
    compiler.hooks.initialize.tap(this.constructor.name, () => {
      fileList = [];
    })
    compiler.hooks.compilation.tap(this.constructor.name, (compilation) => {
      fileList = [];
    })
    compiler.hooks.assetEmitted.tap(
      this.constructor.name,
      (file, { content, source, outputPath, compilation, targetPath }) => {
        fileList.push(file);
      }
    );
    compiler.hooks.done.tapPromise(this.constructor.name, ({compilation}) => {
      const baseURL = compilation.compiler.options.output.path;
      const fileContent = this.swFile
        .replace('__chacheName__', `"${this.chacheName}_cache"`)
        .replace('__CheckList__', JSON.stringify(fileList))
        .replace('__noCacheFileList__', JSON.stringify(this.noCacheFileList))
        .replace('__noCacheApiList__', JSON.stringify(this.noCacheApiList))
        .replace('__cacheFirstList__', JSON.stringify(this.cacheFirstList));
      return fs.outputFile(baseURL + '/sw.js', fileContent).catch(err => {
        console.error(err)
      })
    })
  }
}
module.exports = ServiceWorkerWebpackPlugin;