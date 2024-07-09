// background.js
chrome.contextMenus.create({
    title: '使用度娘搜索：%s', // %s表示选中的文字
    contexts: ['selection'], // 只有当选中文字时才会出现此右键菜单
    onclick: function(params)
    {
        // 注意不能使用location.href，因为location是属于background的window对象
        chrome.tabs.create({url: 'https://www.baidu.com/s?ie=utf-8&wd=' + encodeURI(params.selectionText)});
    }
});

let url = "";
let response = "";
chrome.extension.onMessage.addListener(
    function (request,sender,sendResponse){
        if(request.action === "getData"){
            sendResponse({"url":url,"response":response})
        }
        return true;
    }
);
chrome.extension.onMessage.addListener(
    function (request,sender,sendRequest){
        if(request.action === "removeData"){
            url="";
            response="";
            sendRequest("done");

        }
        return true;
    }
);

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        if (request.contentScriptQuery === 'path'){
            chrome.storage.sync.get('total', function (budget) {
                if (request.notifyOptions.urls && request.notifyOptions.response) {
                    //request.notifyOptions.response.includes(budget.total)
                    url = url + request.notifyOptions.urls + "<br>";
                    response = response + request.notifyOptions.response + "<br>";
                /*    chrome.notifications.create('notification-id', {
                            // type 有四种类型，basic,image,simple,list
                            type: 'basic',
                            iconUrl: 'img/logo.png',
                            title: '有一个信息',
                            message: urls
                        }, function callback(createdNotificationId) {
                            // 通知创建成功后的回调
                            console.log('Notification created with id: ' + createdNotificationId);
                        }
                    )*/


                }
            });
        }


        if (request.contentScriptQuery === 'notification') {
            const {
                notifyOptions
            } = request;
            chrome.notifications.create('notify1', notifyOptions, (id) => {
            //     alert(JSON.stringify(chrome.runtime)); // 如果没调成功可以在这里看看报错，在生产环境别忘了注释掉
            });
        }
        console.log('Did not receive the response!!!');
    });


// 使用 XMLHttpRequest 对象发送请求
//const xhr = new XMLHttpRequest();
//xhr.open('GET', 'https://www.zhihu.com/api/v4/articles/692824625/relationship?desktop=true', true);
//xhr.send();

// 向页面注入JS

/*

// 创建一个原始的 fetch 函数的备份
const originalFetch = window.fetch;

window.fetch = function (url, options) {
    // 在请求发送前进行拦截处理
    console.log('拦截请求:', url, options);

    // 调用原始的 fetch 函数发送请求，并返回一个 Promise 对象
    return originalFetch.apply(this, arguments)
        .then(function (response) {
            // 在响应返回后进行拦截处理
            console.log('拦截响应:', response);

            return response;
        });
};

// 使用 fetch 函数发送请求
fetch('https://api.example.com')
    .then(function (response) {
        // 处理响应数据
    })
    .catch(function (error) {
        // 处理错误信息
    });


// interceptorManager.js
import axios from 'axios';

const interceptorManager = {
    registerInterceptor: (responseCallback) => {
        axios.interceptors.response.use((response) => {
            // 在响应数据处理前，将其传递给回调函数
            responseCallback(response);

            return response;
        });
    },

    unregisterInterceptor: () => {
        axios.interceptors.response.eject();
    },
};

export default interceptorManager;
*/
/*

// YourReactComponent.js
import React, { useEffect, useState } from 'react';
import interceptorManager from './interceptorManager';

const YourReactComponent = () => {
    const [responseData, setResponseData] = useState(null);

    const handleResponse = (response) => {
        // 处理响应数据
        setResponseData(response.data);
    };

    useEffect(() => {
        interceptorManager.registerInterceptor(handleResponse);

        return () => {
            interceptorManager.unregisterInterceptor();
        };
    }, []);

    return (
        <div>
            {/!* 使用 responseData 进行渲染 *!/}
        </div>
    );
};

export default YourReactComponent;
*/
