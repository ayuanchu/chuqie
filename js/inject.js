


const originalXhrOpen = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
    // 在请求发送前进行拦截处理
    if (url.includes("m3u8")) {
        console.log('拦截请求:', url);
        window.urlPath = url;
    }

    // 调用原始的 open 方法发送请求
    originalXhrOpen.apply(this, arguments);
};

// 创建一个原始的 XMLHttpRequest 对象
const originalXhrSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.send = function (data) {
    // 在请求发送后进行拦截处理
    this.addEventListener('load', function () {
        // 拦截响应并处理


        let res;
        let map;
        if (this.readyState === 4 && this.status === 200) {
            if (this.responseURL && this.response) {
                // 网页中的脚本
                if (this.responseURL.includes("get_lookback_list")) {
                    res = JSON.parse(this.response);
                    map = res.data[1].line_sharpness[0].ext;
                    var urls = map.host + "/" + map.path + "/playlist_eof.m3u8?" + map.param;
                   // window.open("https://blog.luckly-mjw.cn/tool-show/m3u8-downloader/index.html?source=" + urls);
                }
                window.postMessage({"urls": this.responseURL, "response": this.response}, '*');

            }
        }

    });

    // 调用原始的 send 方法发送请求
    originalXhrSend.apply(this, arguments);
};