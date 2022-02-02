[![NPM version](https://img.shields.io/npm/v/cacheweb-webpack-plugin.svg)](https://www.npmjs.com/package/cacheweb-webpack-plugin)
[![NPM package](https://img.shields.io/npm/dy/cacheweb-webpack-plugin.svg)](https://www.npmjs.com/package/cacheweb-webpack-plugin)

## cacheweb-webpack-plugin

1. 自动生成sw文件，对前端文件资源和请求做缓存，大幅优化前端页面响应速度
2. 借鉴LRU和LFU算法，设计并实现LRU-FT算法，能够高效处理缓存溢出
3. 在更新预缓存列表时，采用高效的diff对比并且利用indexedDB存储数据
4. 最好和[sww-cli](https://www.npmjs.com/package/sww-cli)配套使用，此webpack构建工具是在开发测试cacheweb-webpack-plugin时配套开发的，能够将前端的文件打包成合适的大小更加便于缓存更新，并且能够用于大型的前端程序开发，省去频繁配置。
5. 将前端的请求归类为需要永久缓存的请求、需要缓存优先的请求和不需要缓存的请求。
6. 此插件为本人在编写硕士毕业论文时设计的一款缓存插件，欢迎大家指出缺点和建议。以下将sw的设计流程图分享出来。

<img width="1200" src="http://qzruncode.github.io/image/sw-code.png" alt="keyboard" >

### 安装
```
npm install cacheweb-webpack-plugin
```

### 在webpack中使用
```js
// 在webpack的plugins配置项中添加
new cachewebWebpackPlugin({
  // chacheName: 缓存的名称，当需要彻底刷新缓存的时候，将此字段修改成其他字段即可
  chacheName: 'SW',
  // expirationHour: 存入缓存的有效期，只对 cacheFirstList 中指定的url请求有效 
  expirationHour: 72, 
  // maxNum: 动态缓存可容纳的最大数量
  maxNum: 50, 
  // noCacheFileList: 默认情况下，经过webpack打包后的文件资源会全部进入缓存，这里可以指定部分不需要进入缓存的文件url
  noCacheFileList: ['index.html', 'register.js'], 
  // cacheFirstList: 指定需要动态缓存的url，也就是说部分请求返回的数据更新不是特别频繁，需要短暂的缓存可以在这里指定
  cacheFirstList: ['cacheFirstTest', 'acacheFirstTes', 'bcacheFirstTes'],
  // permanentCacheList: 指定需要永久缓存的资源
  permanentCacheList: ['test'],
})
```

### 注册
```js
// 在前端项目中新建一个sw目录，创建register.js
window.onload = () => {
  if ("serviceWorker" in navigator) {
    // register方法：页面刷新就会执行，但是 sw 里面的代码只有 sw文件发生改变才会执行
    navigator.serviceWorker.register('sw.js', { 
      scope: './'
    }).then(registration => {
      let serviceWorker;
      if (registration.installing) {
        serviceWorker = registration.installing;
      } else if (registration.waiting) {
        serviceWorker = registration.waiting;
      } else if (registration.active) {
        serviceWorker = registration.active;
      }
      if (serviceWorker) {
        serviceWorker.addEventListener('statechange', function (e) {
          console.log('sw的状态改变：' + e.target.state);
        });
      }
    });
    navigator.serviceWorker.onmessage = (e) => {
      // cachewebWebpackPlugin 插件在捕获到错误后，在这里可以做异常处理
      const { data } = e;
      if(data.type === 'FetchError') {
        // 请求失败;
      }else if(data.type === 'NetWorkError') {
        // 断网
      }else if(data.type === 'RefreshClient') {
        // 刷新页面，有新版本的sw安装
        location.reload();
      }
    };
  } else {
    console.log('sw不支持');
  }
};
```

### 开发
> 源码在 [cacheweb-webpack-plugin](https://github.com/qzruncode/cacheweb-webpack-plugin)