const fs = require('fs-extra');
const path = require('path');

let fileList = [];
class CacheWebWebpackPlugin {
  chacheName=process.cwd().split(path.sep).slice(-1);
  expirationHour=72;
  maxNum=100;
  swFile='';
  noCacheFileList=[
    '/', // 首页不能缓存，缓存后其他文件更新，刷新页面不会有效果
    'sw.js',
  ];
  noCacheApiList=[];
  cacheFirstList=[];

  constructor(options={}) {
    options.chacheName && (this.chacheName = options.chacheName);
    options.expirationHour && (this.expirationHour = options.expirationHour);
    options.maxNum && (this.maxNum = options.maxNum);
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
        .replaceAll('__chacheName__', `"${this.chacheName}_cache"`)
        .replaceAll('__expirationHour__', `"${this.expirationHour}"`)
        .replaceAll('__maxNum__', `"${this.maxNum}"`)
        .replaceAll('__CheckList__', JSON.stringify(fileList))
        .replaceAll('__noCacheFileList__', JSON.stringify(this.noCacheFileList))
        .replaceAll('__noCacheApiList__', JSON.stringify(this.noCacheApiList))
        .replaceAll('__cacheFirstList__', JSON.stringify(this.cacheFirstList))
      return fs.outputFile(baseURL + '/sw.js', fileContent).catch(err => {
        console.error(err)
      })
    })
  }
}
module.exports = CacheWebWebpackPlugin;