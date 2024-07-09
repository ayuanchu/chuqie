$(function(){
    chrome.storage.sync.get('total',function(budget){
        $('#total').text(budget.total);
    });
    $('#add').click(function(){
        chrome.storage.sync.set({'total': $('#amount').val()});
        $('#total').text($('#amount').val());
    });
    $('#remove').click(function(){
        chrome.runtime.sendMessage({action:'removeData'},response =>{
            var element = document.getElementById('table'); // 获取元素
            element.remove(); // 直接从DOM中移除元素
        })
    });

})


function createTable(rows, cols, url, res) {
    var table = document.createElement("table");
    table.id = "table"
    table.style.width = "100%"
    for (var r = 0; r < rows; r++) {
        var row = table.insertRow();
        for (var c = 0; c < cols; c++) {
            var cell = row.insertCell();
            cell.style.border = "1px solid black"
            if (c === 0) {
                cell.textContent = url[r];
            } else if (c === 1) {
                cell.innerHTML = res[r];
            }
        }
    }
    document.getElementById("resValue").appendChild(table)
}

document.addEventListener('DOMContentLoaded',() => {
    chrome.runtime.sendMessage({action:'getData'},response =>{
        url = response.url.split("<br>")
        res = response.response.split("<br>")
        let urlFilter = url.filter(function(str){
            return str.length > 0
        })
        let resFilter = res.filter(function(str){
            return str.length > 0
        })
        createTable(urlFilter.length,2,urlFilter,resFilter);
    }
    )
})