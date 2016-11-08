//-----------------------------------------------------------------------------
function logInfo(info)
{
    $('<p>' + info + '</p>').appendTo(document.body);
}
//-----------------------------------------------------------------------------
function retrieveFullCollection(token, commander, nextProc)
{
    var path = 'data/' + token + '/chunks';
    
    var chunksRegistry = {downloaded: 0, failed: 0, entries: {}};
    
    function gatherCollection()
    {
        var names = Object.keys(chunksRegistry.entries);
        
        var count = names.length;
        
        var collection = [];
        
        for(var i = 0; i < count; ++i)
        {
            var name = names[i];
            
            var lowIndex = parseInt(name.substring(0, name.indexOf('-'))); 
            
            var content = JSON.parse(chunksRegistry.entries[name]);
            
            var recordsCount = content.length;
            
            for(var j = 0; j < recordsCount; ++j)
            {
                collection[lowIndex + j] = JSON.parse('[' +content[j] + ']');
            }
        }
        
            // array of arrays
        return collection;
    }
    
    function registerChunk(context)
    {
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            ++chunksRegistry.downloaded;
            
            logInfo('*downloaded ' + context.name);
            
            chunksRegistry.entries[context.name] = context.message.yadTransaction.response;
        }
        else
        {
            ++chunksRegistry.failed;
            
            logInfo('*failed ' + context.name);
        }
        
        var responded = chunksRegistry.downloaded + chunksRegistry.failed;
        
        if(responded === chunksRegistry.total)
        {
            var collection;
            
            if(chunksRegistry.failed === 0)
            {
                logInfo('All chuncks downloaded');
                
                collection = gatherCollection();
                
                logInfo(collection.length + ' records parsed (' + collection[0].length + ' fields each)');
            }
            else
            {
                logInfo('Failed to gather chunks');
                
                collection = null;
            }
            
            nextProc(collection);
        }
    }
    
    function processItemsList(context)
    {
        if(context.message.yadTransaction && !context.message.yadTransaction.error)
        {
            var responseObject = JSON.parse(context.message.yadTransaction.response);
            
            var items = responseObject._embedded.items;
            
            chunksRegistry.total = items.length;
                    
            for(var i = 0; i < items.length; ++i)   
            {
                var name = items[i].name;
                
                commander.issueCommand('YAD_READ_FILE', [path + '/' + name, false], registerChunk, {name: name});
            }
        }
        else
        {
            logInfo('*error: ' + JSON.stringify(context.message));
        }
    }
    
    commander.issueCommand('YAD_LIST_ELEMENTS', [path, ['_embedded.items.name'], 100, 0], processItemsList);
}
//-----------------------------------------------------------------------------
function main(commander)
{
    var token = 'int_train';

    retrieveFullCollection(token, commander, function(collection){
      
        if(collection)
        {
            // clusterize?    
        }
    });   
}
//-----------------------------------------------------------------------------
$(document).ready(function(){
    
    var socket = io.connect();        
    
    var commander = new AsyncCommander(socket, 'message');
    
    socket.on('connect', function(){
       
        logInfo('*connect'); 
        
        main(commander);
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
