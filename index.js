const fs = require('fs-extra');
const path = require('path');

let fileList = [];
class CacheWebWebpackPlugin {
  constructor(options={}) {
    // 初始化
    this.chacheName = process.cwd().split(path.sep).slice(-1);
    this.expirationHour = 5;
    this.maxNum = 100;
    this.swFile = '';
    this.noCacheFileList=[
      '/', // 首页不能缓存，缓存后其他文件更新，刷新页面不会有效果
      'sw.js',
    ];
    this.cacheFirstList = [];
    this.permanentCacheList = [];

    // 设置用户参数
    options.chacheName && (this.chacheName = options.chacheName);
    options.expirationHour && (this.expirationHour = options.expirationHour);
    !isNaN(options.maxNum) && (this.maxNum = options.maxNum);
    options.noCacheFileList && this.noCacheFileList.push(...options.noCacheFileList);
    options.cacheFirstList && this.cacheFirstList.push(...options.cacheFirstList);
    options.permanentCacheList && this.permanentCacheList.push(...options.permanentCacheList);
    
    // 读取sw文件字符串
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
        .replaceAll('__cacheFirstList__', JSON.stringify(this.cacheFirstList))
        .replaceAll('__permanentCacheList__', JSON.stringify(this.permanentCacheList))
      return fs.outputFile(baseURL + '/sw.js', fileContent).catch(err => {
        console.error(err)
      })
    })
  }
}
module.exports = CacheWebWebpackPlugin;