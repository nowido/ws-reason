//-----------------------------------------------------------------------------
var lock = false;
//-----------------------------------------------------------------------------
function scrollPage()
{
    $('#rootContainer').scrollTop($('#info').height());
}
//-----------------------------------------------------------------------------
function logInfo(info)
{
    $('#info').append('<p>' + info + '</p>');
    
    scrollPage();
}
//-----------------------------------------------------------------------------
function onChunkWriteResponded(context)
{
    var registry = context.registry;
    
    var name = registry.currentName;
    
    if(context.message.yadTransaction && !context.message.yadTransaction.error)
    {
        logInfo(name + ' possibly written');
        
        registry.currentIndex++;

        if(registry.currentIndex < registry.chunks.length)
        {
            var chunk = registry.chunks[registry.currentIndex];
            
            var chunkSize = chunk.length;
                           
            var itemName = registry.accIndex.toString() + '-' + (registry.accIndex + chunkSize - 1).toString() + '.json';
            
            registry.accIndex += chunkSize;

            registry.currentName = itemName;
            
            var path = context.chunksPath + '/' + itemName;
            var content = JSON.stringify(chunk);
            
            context.commander.issueCommand('YAD_WRITE_FILE', 
                [path, false, content], onChunkWriteResponded, context);
        }
        else
        {
            logInfo('All done. Stopped');    
        }
    }
    else
    {
        logInfo('Failed to write chunk ' + name);
        logInfo('Stopped');
    }
}
//-----------------------------------------------------------------------------
function startWriteChunksSequence(context)
{
    var chunks = context.chunks;

    var chunkSize = chunks[0].length;
    
    var accIndex = 0;
    
    var itemName = accIndex.toString() + '-' + (accIndex + chunkSize - 1).toString() + '.json';
    
    accIndex += chunkSize;
    
    var registry = {chunks: chunks, currentIndex: 0, accIndex: accIndex, currentName: itemName};
    
    var path = context.chunksPath + '/' + itemName;
    var content = JSON.stringify(chunks[0]);
    
    context.commander.issueCommand('YAD_WRITE_FILE', 
        [path, false, content], onChunkWriteResponded, 
            {chunksPath: context.chunksPath, registry: registry});
}
//-----------------------------------------------------------------------------
function uploadChunks(context)
{
    // use app:/data/<dbname>/chunks folder
    
    var fname = context.file.name;
    var lastPointIndex = fname.lastIndexOf('.');
    
    var dbname = (lastPointIndex < 0) ? fname : fname.substring(0, lastPointIndex);
    
    logInfo('db name: ' + dbname);
    
    var path1 = 'data/' + dbname;
    
    context.commander.issueCommand('YAD_CREATE_FOLDER', [path1], function(ctx1){
        
        if(ctx1.message.yadTransaction && !ctx1.message.yadTransaction.error)
        {
            logInfo('Created db folder: ' + path1);
            
            var path2 = path1 + '/chunks';
            
            ctx1.commander.issueCommand('YAD_CREATE_FOLDER', [path2], function(ctx2){
                
                if(ctx2.message.yadTransaction && !ctx2.message.yadTransaction.error)
                {
                    logInfo('Created db/chunks folder: ' + path2);
                    
                    context.chunksPath = path2;

                    startWriteChunksSequence(context);
                }
                else
                {
                    logInfo('Failed to create db/chunks folder ' + path2);
                    logInfo('Stopped');
                }
            });
        }
        else
        {
            logInfo('Failed to create db folder ' + path1 + ' (may be it is already exists, overwrite is not allowed)');
            logInfo('Stopped');
        }
    });
}
//-----------------------------------------------------------------------------
function prepareChunks(context)
{
    $('#skipCheckbox').attr('disabled', 'true');
    $('#uploadButton').attr('disabled', 'true');
    
    var skipFirst = $('#skipCheckbox').prop('checked');
    
    var rows = context.dataRows;
    
    const goodChunkSize = 128 * 1024;
    
    var accChunkSize = 0;
    
    var chunks = [];
    
    var currentChunk = [];
    var currentChunkContentSize = 0;
    
    var lastIndex = rows.length - 1;
    
    for(var i = (skipFirst ? 1 : 0); i < rows.length; ++i)
    {
        // push strings to chunks, while current chunk's length is less than goodChunkSize

        var r = rows[i];
        
        if((currentChunkContentSize > goodChunkSize) || (i === lastIndex))
        {
            accChunkSize += currentChunkContentSize;
            
            // current chunk has overfilled, or no more data;
            //  push chunk into chain ...
            
            chunks.push(currentChunk);
            
                // ... and prepare new chunk
                
            if(i !== lastIndex)
            {
                currentChunk = [];
                currentChunkContentSize = 0;
            }
        }
        
        currentChunkContentSize += r.length;
        currentChunk.push(r);
    }
    
    logInfo(chunks.length + ' chunk(s) created with average size of ' + Math.floor(accChunkSize / chunks.length) + ' UTF-8 char(s)');
    logInfo('Starting upload ...');
    
    context.chunks = chunks;
    
    uploadChunks(context);
}
//-----------------------------------------------------------------------------
function readCsvData(context)
{
    var reader = new FileReader();
    
    reader.onload = function(e)
    {
        var content = e.target.result.replace(/,/g, '.').split(/$\n/m);
        
        var rows = [];

        for(var i = 0; i < content.length; ++i)
        {
            var s = content[i].replace(/;/g, ',').replace(/\s/g,'');
            
            if(s.length > 0)
            {
                rows.push(s);
            }
        }

        logInfo(rows.length + ' line(s) parsed');
        
        const showBlockSize = 5;
        
        var rowsToDisplayFirst = (rows.length > showBlockSize) ? showBlockSize : rows.length;
        var tailSize = rows.length - rowsToDisplayFirst;
        var rowsToDisplayLast = (tailSize > showBlockSize) ? showBlockSize : tailSize;
        
        for(var i = 0; i < rowsToDisplayFirst; ++i)
        {
            logInfo((i + 1) + ' : ' + rows[i]);
        }
        
        if(rowsToDisplayLast)
        {
            logInfo('...');
        }
        
        for(var i = 0; i < rowsToDisplayLast; ++i)
        {
            var absoluteIndex = rows.length - rowsToDisplayLast + i;
            logInfo((absoluteIndex + 1) + ' : ' + rows[absoluteIndex]);
        }
        
        logInfo('&lt end of csv data &gt');
        
        $('#info').append('<label><input type="checkbox" id="skipCheckbox">skip first row </label><button id="uploadButton">Upload</button>');
        
        scrollPage();
        
        context.dataRows = rows;
        
        $('#uploadButton').click(function(){prepareChunks(context)});
    }
    
    reader.readAsText(context.file);
}
//-----------------------------------------------------------------------------
function main(commander)
{
    $('#info').append('<input id="fileInput" type="file" accept=".csv" multiple="false" style="display:none">');
    $('#info').append('<button id="openButton">Open CSV file ...</button>');
    
    scrollPage();
    
    $('#openButton').on('click', function(){$('#fileInput')[0].click();});
    
    $('#fileInput').on('change', function(){
        
        $('#openButton').attr('disabled', 'true');
        
        var fob = $('#fileInput')[0].files[0];
        
        logInfo(fob.name + ' (' + fob.size + ' bytes) selected');
        
        readCsvData({file: fob, commander: commander});
    });
}
//-----------------------------------------------------------------------------
$(document).ready(function(){
    
    $(document.body).append('<div id="rootContainer"></div>');
    $('#rootContainer').css({'overflow' : 'auto', 'height': '100%'});
    $('#rootContainer').append('<div id="info"></div>');

    var socket = io.connect();        
    
    var commander = new AsyncCommander(socket, 'message');
    
    socket.on('connect', function(){
       
        logInfo('*connect'); 
        
        if(!lock)
        {
            lock = true;
            
            main(commander);
        }
    });
    
    socket.on('disconnect', function(reason){
       
       logInfo('*disconnect: ' + reason); 
    });
    
    socket.on('message', function(message){
        
        if(!commander.hold(message, socket)){
            
                // to do: make special dispatcher for incoming notifications 
                
            logInfo('*unknown reason: ' + message.reason);
        }
    });
});
//-----------------------------------------------------------------------------
