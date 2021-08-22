[![NPM version](https://img.shields.io/npm/v/react-vitual-keyboard.svg)](https://www.npmjs.com/package/webcache-webpack-plugin)
[![NPM package](https://img.shields.io/npm/dy/webcache-webpack-plugin.svg)](https://www.npmjs.com/package/webcache-webpack-plugin)

## webcache-webpack-plugin

自动生成sw文件，对前端的api请求和文件请求做缓存，大幅优化前端页面响应速度

## 设计思路

<img width="200" src="http://qzruncode.github.io/image/sw.jpg" alt="keyboard" >

### 安装
```
npm install webcache-webpack-plugin
```

### 使用
```js
// 在webpack的plugins配置项中添加
new SwCheckListPlugin({
  chacheName: 'v', // 当需要重置缓存，修改此版本号即可，不推荐频繁更新
  noCacheFileList: [ // 不需要缓存文件请求资源
    'index.html',
    'sw/register.js'
  ],
  noCacheApiList: [ // 不需要缓存的api请求资源
    'test'
  ],
  cacheFirstList: [ // 应用缓存优先的资源
    'cacheFirstTest'
  ]
})

// 在前端项目中新建一个sw目录，创建register.js
window.onload = () => {
  if ("serviceWorker" in navigator) {
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
      console.log(1111, e);
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
> 源码在 [webcache-webpack-plugin](https://github.com/qzruncode/webcache-webpack-plugin)