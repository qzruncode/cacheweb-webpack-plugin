// 只要sw中的代码发生了任何字节级别的变化，浏览器会自动启动 字节比较，如果发生了变化会立即出发sw的注册流程
const chacheName = __chacheName__; // 更新缓存只需要修改 chacheName 版本号即可
const dynamicChacheName = __chacheName__ + "_dynamic";
const permanentCacheName = __chacheName__ + "_permanent";
const dbName = chacheName + "SW";
const maxNum = Number(__maxNum__);
const expirationHour = Number(__expirationHour__);
const checkList = __CheckList__;
const noCacheFileList = __noCacheFileList__; // 通过webpack编译后的文件，某些文件用户不希望缓存
const cacheFirstList = __cacheFirstList__; // 缓存优先的动态资源
const permanentCacheList = __permanentCacheList__; // 哪些资源需要运用永久缓存，用户未指定的所有请求都不需要缓存

// 注意点：在修改此文件时，一定要注意，在sw重新注册后，首次刷新时fetch中调用的代码都是上个sw中的代码，在其中访问的任何变量都是旧的
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
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      // 这里只需要对 文件类型的资源做预缓存
      const cache = await caches.open(chacheName);
      const itemKeyMap = await storeCheckList(checkList);
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
  self.clients.claim();
  e.waitUntil(
    (async () => {
      const keyList = await caches.keys();
      await Promise.all(
        keyList.map((key) => {
          const exist =
            [chacheName, dynamicChacheName, permanentCacheName].findIndex(
              (name) => name === key
            ) === -1;
          if (exist) {
            caches.delete(key);
            indexedDB.deleteDatabase(key + "SW");
          }
        })
      );
      reportError("RefreshClient", null);
    })()
  );
});

function isReqInList(req, list) {
  return (
    list.findIndex((item) => {
      const pathname = new URL(req.url).pathname;
      return decodeURIComponent(pathname.slice(1)) == item;
    }) != -1
  );
}

async function handlePermanentCache(list, req) {
  if (isReqInList(req, list)) {
    const cachedState = await caches.match(req);
    if (cachedState) {
      return cachedState;
    } else {
      const response = await makeFetch(req);
      if (response && response.ok) {
        const cache = await caches.open(permanentCacheName);
        await cache.put(req, response.clone());
      }
      return response;
    }
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
      // 缓存中没有数据，需要从后台获取，之后运用 LRU_FT 做缓存替换
      // 走入这一步的都是 cacheFirstList 中的请求
      const tmpRes = await makeFetch(req);
      if (tmpRes && tmpRes.ok) {
        const res = tmpRes.clone();
        await LRU_FT(req, res);
      }
      return tmpRes;
    }
  }
}

async function LRU_FT(req, res) {
  const cache = await caches.open(dynamicChacheName);
  const keys = await cache.keys();

  const saveReq = async () => {
    // 保存资源，未超出cache缓存数量，在header中保存字段，直接存入
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
  if (keys.length >= maxNum) {
    // 超出cache缓存数量，首先移除超出有效期的缓存
    let flag = false; // 记录缓存中是否已经移除了部分缓存
    const requests = []
    keys.forEach(request => {requests.push(cache.match(request))})
    Promise.allSettled(requests).then(responses => {
      responses.forEach(response => {
        if (response.status === 'fulfilled' && response.value.headers.has("sw-date")) {
          const dateHeader = response.value.headers.get("sw-date");
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
      })

      if (!flag) {
        // 执行到这一步说明缓存中并没有资源过期，cache新缓存的资源都是从尾部存入，越先存入的资源，在cache中越靠前的位置，移除的时候将最靠前的删除
        // 采用打分机制，分数上限为maxScore，资源的分数由 其在cache中的位置+命中数 构成，优先删除分数最低的资源，当分数一样时，优先删除cache中位置最靠前的
        const maxScore = maxNum;
        // 找到分数最小的缓存
        const minimumScoreResponse = responses.reduce((preReponse, curReponse, index) => {
          if (preReponse.status === 'fulfilled' && curReponse.status === 'fulfilled') {
            const preReponseHits = Number(preReponse.value.headers.get("hits"));
            const curReponseHits = Number(curReponse.value.headers.get("hits"));
            let preReponseScore = preReponseHits + (index - 1);
            preReponseScore = preReponseScore > maxScore ? maxScore : preReponseScore;
            let curReponseScore = curReponseHits + index;
            curReponseScore = curReponseScore > maxScore ? maxScore : curReponseScore;
            if(preReponseScore > curReponseScore) {
              return curReponse;
            } else {
              return preReponse;
            }
          }
        });
        if(minimumScoreResponse) {
          console.log('minimumScoreResponse', minimumScoreResponse);
          const minimumScoreIndex = responses.findIndex(item => item === minimumScoreResponse);
          cache.delete(keys[minimumScoreIndex]);
        }
      }
      saveReq();
    })
  } else {
    saveReq();
  }
}

// 无缓存策略
async function handleNoCache(req) {
  // 缓存中没有数据，从服务器请求后存入缓存中
  const defaultRes = await makeFetch(req);
  return defaultRes;
}

self.addEventListener("fetch", (e) => {
  e.respondWith(
    (async () => {
      // 新的sw文件过来后，这个函数执行，内部访问的还是之前旧版的sw
      // 缓存列表必须从服务端实时fetch过来，要不然用的还是上个版本sw的列表

      if (!isReqInList(e.request, noCacheFileList)) {
        const permanentCacheRes = await handlePermanentCache(
          permanentCacheList,
          e.request
        );
        if (permanentCacheRes != undefined) return permanentCacheRes;

        const cacheFirstRes = await handleCacheFirst(
          [cacheFirstList, checkList],
          e.request
        );
        if (cacheFirstRes != undefined) return cacheFirstRes;
      }

      const noCacheRes = await handleNoCache(e.request);
      return noCacheRes;
    })()
  );
});