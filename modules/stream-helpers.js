//-----------------------------------------------------------------------------

var fs = require('fs');

//-----------------------------------------------------------------------------

exports.asyncReadTextStream = function(stream, callbackOnDone)
{
  	stream.once('error', function(e){
  	   callbackOnDone("");
  	});
  	
	var content = "";
	
	stream.on('data', function(chunk){
		
        content += chunk;
	});

	stream.once('end', function(){		
	  
		stream.removeAllListeners('data');		
		  
		callbackOnDone(content);
	});		
}

exports.asyncReadTextFile = function(path, callbackOnDone)
{
    exports.asyncReadTextStream(fs.createReadStream(path), callbackOnDone);
}

exports.asyncReadBinaryStream = function(stream, callbackOnDone)
{
  	stream.once('error', function(e){
  	   callbackOnDone(null);
  	});

	var contentChunks = [];
	var length = 0;
	
	stream.on('data', function(chunk){
		    
	  length += chunk.length;
	  contentChunks.push(chunk);
	});

	stream.once('end', function(){		
	  
	  stream.removeAllListeners('data');		
	  
	  callbackOnDone(Buffer.concat(contentChunks, length));
	});		
}

exports.asyncReadBinaryFile = function(path, callbackOnDone)
{
  	exports.asyncReadBinaryStream(fs.createReadStream(path), callbackOnDone)
}

exports.asyncCacheFiles = function(reqs, onProgress, onDone, onFail){
    
    reqs.map(function(entry){
        
        var actualReadFunc = (entry.mode === 0) ? 
            exports.asyncReadBinaryFile : 
                exports.asyncReadTextFile;
        
       actualReadFunc(entry.path, function(content){
            
            if(content)
            {
                onProgress(this.path, content);
            }
            
            this.content = content;  
            this.done = true; 
            
            var countDone = 0;
            var allOk = true;
            
            reqs.map(function(e){
                
                countDone += (e.done ? 1 : 0);
                
                allOk = e.content ? allOk : false;
            });
            
            if(countDone === reqs.length)
            {
                if(allOk)
                {
                    onDone();
                }    
                else
                {
                    onFail();
                }
            }
            
        }.bind(entry));
    });
}

//-----------------------------------------------------------------------------
