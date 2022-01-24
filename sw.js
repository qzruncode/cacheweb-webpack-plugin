const chacheName = __chacheName__; // 更新缓存只需要修改 chacheName 版本号即可
const dynamicChacheName = __chacheName__ + "_dynamic";
const dbName = chacheName + "SW";
const maxNum = Number(__maxNum__);
const expirationHour = Number(__expirationHour__);
const checkList = __CheckList__;
const noCacheFileList = __noCacheFileList__; // 不需要缓存的文件资源
const noCacheApiList = __noCacheApiList__; // 无需缓存的动态资源
const noCacheList = [...noCacheFileList, ...noCacheApiList];
const cacheFirstList = __cacheFirstList__; // 缓存优先的动态资源

// checklist.json 文件类型的资源，大型项目体积巨大，存在 indexDB 中，检索速度快。文件名称改变，diff两个checklist的区别，修改cache中的内容，增量修改
// 只要我们的代码改变，我们生成的checkList就会改变，浏览器识别到sw文件内容发生更改后，会在浏览器空闲的时候去安装sw
/**
 * 动态的资源
 * 1.需要实时变化请求的资源，从网络中取，用网络中的资源，同时缓存在本地，当网络断开，使用缓存的资源并且提示用户网络断开（请求优先策略）
 * 2.某些资源变化不是很多，但是偶尔也会变化，如图片请求（缓存优先策略）
 * 3.某些资源请求一次后就不会再变化（只取缓存）
 */

/**
 * 当发布新版本，涉及到更新整个缓存资源的，直接修改版本号即可
 */

// 实现
/**
 * 1.checklist存入indexdb中，请求的文件类型资源放在 chacheName v 版本中
 * 2.动态资源放在 chacheName s 版本中
 *  需要长期缓存的资源，添加个标记，用缓存优先策略
 *  某些资源实时更新，但是希望请求服务端资源出错的情况下，使用上次请求的缓存，先从服务端那边取资源，资源取失败了，从缓存中取
 *  某些资源根本就不需要缓存，不用存入缓存中
 */

// 分仓操作路线行不通，因为 新的sw文件过来后，这个函数执行，内部访问的还是之前旧版的sw，fetch中访问的还是之前的sw，导致访问的cachelist也是之前的版本

class MessageEntity {
  constructor(type = "", data = "") {
    this.type = type;
    this.data = data;
  }
}

function reportError(type, msg) {
  const m = new MessageEntity(type, msg);
  self.clients.matchAll().then(function (clientList) {
    clientList.forEach((client) => {
      client.postMessage(m);
    });
  });
}

function refreshClient() {
  reportError("RefreshClient", null);
}

async function makeFetch(req) {
  return await fetch(req)
    .then((res) => {
      if (!res.ok) {
        reportError("FetchError", res.statusText);
      }
      return res;
    })
    .catch((err) => {
      reportError("NetWorkError", err);
    });
}

function storeCheckList(list) {
  return new Promise((resolve, reject) => {
    const dbr = indexedDB.open(dbName);
    dbr.onsuccess = () => {
      const db = dbr.result;
      const transaction = db.transaction("checkList", "readwrite");
      const objectStore = transaction.objectStore("checkList");
      const cr = objectStore.openCursor(null, "next");

      // 0 表示不变
      // -1 表示删除
      // 1 表示新增
      const itemKeyMap = list.reduce((pre, cur) => {
        pre[cur] = 1;
        return pre;
      }, {});

      let preCursor = { value: { id: -1 } };
      cr.onsuccess = function (e) {
        const cursor = e.target.result;
        if (cursor) {
          switch (itemKeyMap[cursor.value.value]) {
            case undefined: {
              // 数据库中的url，不在最新版本的list中
              itemKeyMap[cursor.value.value] = -1; // 标记为 删除
              objectStore.delete(cursor.value.id); // 从数据库中删除
              break;
            }
            case 1: {
              // 数据库中的url，在最新版本的list中
              itemKeyMap[cursor.value.value] = 0; // 标记为 不变
            }
            default: {
              break;
            }
          }
          preCursor = cursor;
          cursor.continue();
        } else {
          // 更新数据库中的数据
          for (const key in itemKeyMap) {
            const value = itemKeyMap[key];
            if (value == 1) {
              objectStore.put({ value: key, id: ++preCursor.value.id });
            }
          }
          resolve(itemKeyMap);
        }
      };
    };

    dbr.onupgradeneeded = function (e) {
      console.log("db更新了");
      const db = e.target.result; // 获取IDBDatabase
      db.createObjectStore("checkList", { keyPath: "id" });
    };
  });
}

self.addEventListener("install", (e) => {
  console.log(1);
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      console.log(4);
      // 这个地方只会对也只需要对 文件类型的资源做预缓存
      const cache = await caches.open(chacheName);
      const itemKeyMap = await storeCheckList(checkList);
      console.log(44, itemKeyMap);
      for (const key in itemKeyMap) {
        const value = itemKeyMap[key];
        if (!noCacheFileList.includes(key)) {
          if (value == 1) {
            // 新增的资源
            await cache.add(key);
          } else if (value == -1) {
            // 要删除的资源
            await cache.delete(key);
          }
        }
      }
    })()
  );
});

self.addEventListener("activate", (e) => {
  // 注册新的sw时候调用，这里一般清除老sw的缓存
  console.log(2);
  self.clients.claim();
  e.waitUntil(
    (async () => {
      console.log(5);
      const keyList = await caches.keys();
      await Promise.all(
        keyList.map((key) => {
          if (key !== chacheName) {
            caches.delete(key);
            indexedDB.deleteDatabase(key + "SW");
          }
        })
      );
      refreshClient();
    })()
  );
});

function isReqInList(req, list) {
  return (
    list.findIndex((item) => {
      const pathname = new URL(req.url).pathname;
      if (pathname == "/") return true;
      return pathname.slice(1) == item;
    }) != -1
  );
}

// 无缓存策略
async function handleNoCache(list, req) {
  // 不需要缓存的资源，直接从服务端取
  if (isReqInList(req, list)) {
    const response = await makeFetch(req);
    return response;
  }
}

async function handleCacheFirst(list, req) {
  // 应用缓存优先策略的动态资源 从缓存中取，有的话直接返回
  // 传入的list，包含 cacheFirstList 和 checkList 组成
  if (isReqInList(req, list.flat(1))) {
    const cachedState = await caches.match(req);
    if (cachedState) {
      // 缓存中有数据，直接返回
      // checkList 中的资源已经在预缓存的时候存储到cache中，所以所有的 checkList 中的请求都只会走这一步

      // 需要给 cacheFirstList 中的请求，response的hits命中数增加1
      if (isReqInList(req, list[0])) {
        const tmpRes = cachedState.clone();
        const headers = new Headers(tmpRes.headers);
        headers.set("hits", Number(headers.get("hits")) + 1);
        const blob = await tmpRes.blob();
        const copyRes = new Response(blob, {
          status: tmpRes.status,
          statusText: tmpRes.statusText,
          headers: headers,
        });
        const cache = await caches.open(dynamicChacheName);
        await cache.put(req, copyRes); // 直接用put操作，就可以确保最后访问的资源在cache的最后面，这是cache的内在机制
      }
      return cachedState;
    } else {
      // 缓存中没有数据，需要从后台获取，之后运用 LRU_F 做缓存替换
      // 走入这一步的都是 cacheFirstList 中的请求
      const tmpRes = await makeFetch(req);
      if (tmpRes.ok) {
        const res = tmpRes.clone();
        await LRU_F(req, res);
      }
      return tmpRes;
    }
  }
}

async function LRU_F(req, res) {
  const cache = await caches.open(dynamicChacheName);
  const keys = await cache.keys();
  console.log("rad", keys);

  if (keys.length > maxNum) {
    // 超出cache缓存数量
    // 1. 首先移除超出有效期的缓存
    let flag = false; // 缓存中是否已经移除了部分缓存
    keys.forEach(async function (request) {
      const response = await cache.match(request);
      if (response.headers.has("sw-date")) {
        const dateHeader = response.headers.get("sw-date");
        const parsedDate = new Date(Number(dateHeader));
        const headerTime = parsedDate.getTime();
        if (!isNaN(headerTime)) {
          const now = Date.now();
          const expirationSeconds = expirationHour * 60 * 60;
          if (headerTime < now - expirationSeconds * 1000) {
            // 资源过期了，将过期资源删除
            console.log("过期了", request);
            cache.delete(request);
            flag = true; // 缓存资源已经被移除，有足够的空间存入新缓存
          }
        }
      }
    });

    if (!flag) {
      // 缓存中并没有资源过期，cache新缓存的资源都是从尾部存入，越先存入的资源，在cache中越靠前的位置，移除的时候将最靠前的删除
      // 如果一个请求在 某个时间间隔内，被高频访问，其命中数会急速上升，则认为此缓存的命中率极高，当过了此时间间隔后，长时间未访问，其会排在cache中最靠前的位置
      // 在删除最靠前的元素之前，需要和next元素做命中数对比，谁小删谁。当出现极端情况，缓存全是短时间爆拉的高命中数缓存后续长时间未访问，由于只和next元素比较，所以最多只会存在一个高命中数死缓存，保证了不会占据新缓存的位置
      
      // 实现步骤1：对比cache开头的两个缓存的 hits，谁大删除谁
    }
  }

  // 保存资源
  // 未超出cache缓存数量，在header中保存字段，直接存入
  const headers = new Headers(res.headers);
  headers.append("sw-date", new Date().getTime());
  headers.append("hits", 1); // 新的资源进入缓存，将命中数设置为1
  const blob = await res.blob();
  const copyRes = new Response(blob, {
    status: res.status,
    statusText: res.statusText,
    headers: headers,
  });
  await cache.put(req, copyRes);
}

async function handleNetworkFirst(req) {
  // 缓存中没有数据，从服务器请求后存入缓存中
  const defaultRes = await makeFetch(req);
  return defaultRes;
}

self.addEventListener("fetch", (e) => {
  console.log(3);
  e.respondWith(
    (async () => {
      console.log(6);
      // 新的sw文件过来后，这个函数执行，内部访问的还是之前旧版的sw
      // 缓存列表必须从服务端实时fetch过来，要不然用的还是上个版本sw的列表

      const nocacheRes = await handleNoCache(noCacheList, e.request);
      if (nocacheRes != undefined) return nocacheRes;
      const cacheFirstRes = await handleCacheFirst(
        [cacheFirstList, checkList],
        e.request
      );
      if (cacheFirstRes != undefined) return cacheFirstRes;
      const networkFirstRes = await handleNetworkFirst(e.request);
      return networkFirstRes;
    })()
  );
});
