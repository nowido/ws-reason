//----------------------------------------------------------------------------- 
function logInfo(info)
{
    $('<p>' + info + '</p>').appendTo(document.body);
}
//----------------------------------------------------------------------------- 

function onFolderCreate(context)
{
    logInfo(JSON.stringify(context.message.yadTransaction));
    context.commander.closeReason(context.message.reason);
}

function onYadFileDone(context)
{
    logInfo(JSON.stringify(context.message.yadTransaction));
    /*
    var b64 = context.message.yadTransaction.response;
    
    var buffer = base64ToBin(b64);
    
    logInfo('Buffer length ' + buffer.length)
    
    var fb = new Float32Array(buffer.buffer);
    
    for(var i = 0; i < 10; ++i)
    {
        logInfo(fb[i]);
    }
    */
    context.commander.closeReason(context.message.reason);
    /*
    context.commander.issueCommand('YAD_WRITE_FILE', ['5.jpg', true, context.message.yadTransaction.response], function(ctx){
        
        logInfo(JSON.stringify(ctx.message.yadTransaction));
        
        ctx.commander.closeReason(ctx.message.reason);
    });*/
}

//----------------------------------------------------------------------------- 
$(document).ready(function(){
    
    var socket = io.connect();        
    
    var commander = new AsyncCommander(socket, 'message');
    
    socket.on('connect', function(){
       
        logInfo('*connect'); 
        /*
        var binBulk = new Float32Array(10);
        
        for(var i = 0; i < 10; ++i)
        {
            binBulk[i] = i * 1.5;       
        }
        
        var binStr = binToBase64(new Uint8Array(binBulk.buffer));
        */
        
        //var jsonStr = JSON.stringify({a: [1, 2, 33], b: 'Hello, World!'});
        
        //commander.issueCommand('YAD_WRITE_FILE', ['2.txt', false, 'Hello, World! 2'], onYadFileDone);
        //commander.issueCommand('YAD_READ_FILE', ['2.txt', false], onYadFileDone);
        //commander.issueCommand('YAD_CREATE_FOLDER', ['2'], onFolderCreate);
        //commander.issueCommand('YAD_MOVE_ELEMENT', ['2/3.txt', '2.txt'], onFolderCreate);
        commander.issueCommand('YAD_LIST_ELEMENTS', ['', ['_embedded.items.name', '_embedded.total'], 40, 0], onFolderCreate);
    });
    
    socket.on('disconnect', function(reason){
       
       logInfo('*disconnect: ' + reason); 
    });
    
    socket.on('message', function(message){
        
        if(!commander.hold(message, socket)){
            
            logInfo('*unknown reason: ' + message.reason);
        }
    });
});
//-----------------------------------------------------------------------------        
