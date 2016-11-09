//-----------------------------------------------------------------------------     
function generateUniqueKey(length)
{
    var hexDigits = "0123456789ABCDEF";
    
    if(length === undefined)
    {
        length = 16;
    }
    
    var s = "";
    
    for(var i = 0; i < length; ++i)
    {
        var index = Math.floor(16 * Math.random());
        
        s += hexDigits.charAt(index);
    }
    
    return s;
}

//----------------------------------------------------------------------------- 

function decimalRound(number, precision) 
{
    var factor = Math.pow(10, precision);
    var tempNumber = number * factor;
    var roundedTempNumber = Math.round(tempNumber);
    return roundedTempNumber / factor;
};

//----------------------------------------------------------------------------- 
function AsyncCommander(socket, channel)
{
    this.socket = socket;
    this.channel = channel;
    
    this.actions = {};
}

AsyncCommander.prototype.issueCommand = function(command, args, callbackOnDone, callbackContext)
{
   var key = generateUniqueKey();

   this.actions[key] = 
   {
       proc: callbackOnDone, 
       context: (callbackContext ? callbackContext : {})
   };

   this.socket.emit(this.channel, {command: command, args: args, reason: key});
}

AsyncCommander.prototype.hold = function(message, socket)
{
    var actionEntry = this.actions[message.reason];
    
    if(actionEntry)
    {
        actionEntry.context.message = message;
        actionEntry.context.commander = this;
        
        actionEntry.proc(actionEntry.context);
        
        return true;
    }
    else
    {
        return false;
    }
}

AsyncCommander.prototype.closeReason = function(reason)
{
    delete this.actions[reason];
}
//----------------------------------------------------------------------------- 
function binToBase64(buffer)
{   
        // buffer is Uint8Array
        
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    
    var bufferLength = buffer.byteLength;

    var trailingBytesCount = bufferLength % 3;
    var tripletsCount = (bufferLength - trailingBytesCount) / 3;
    
    var outputArray = [];
            
    var tmp;
    var byteIndex = 0;
        
    for(var i = 0; i < tripletsCount; ++i)
    {
        tmp = (buffer[byteIndex] << 16) + (buffer[byteIndex + 1] << 8) + buffer[byteIndex + 2];
        byteIndex += 3;
        
        outputArray.push(code[tmp >> 18]);
        outputArray.push(code[(tmp >> 12) & 0x3F]);
        outputArray.push(code[(tmp >> 6) & 0x3F]);
        outputArray.push(code[tmp & 0x3F]);
    }
    
    if(trailingBytesCount === 1)
    {
        tmp = (buffer[byteIndex] << 16);
        
        outputArray.push(code[tmp >> 18]);
        outputArray.push(code[(tmp >> 12) & 0x3F]);
        outputArray.push('=');
        outputArray.push('=');
    }
    else
    {
        tmp = (buffer[byteIndex] << 16) + (buffer[byteIndex + 1] << 8);
        
        outputArray.push(code[tmp >> 18]);
        outputArray.push(code[(tmp >> 12) & 0x3F]);
        outputArray.push(code[(tmp >> 6) & 0x3F]);
        outputArray.push('=');
    }
    
    return outputArray.join('');
}

function base64ToBin(b64)
{
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    
    var lookup = {};
    
    for(var i = 0; i < 64; ++i)
    {
        lookup[code[i]] = i;
    }
    
    lookup['='] = 0;
    
        //
        
    var length = b64.length;
    
    if(length % 4 !== 0)
    {
        length -= (length % 4);
    }
    
    var tripletsCount = length / 4;
    var bufferLength = tripletsCount * 3;
    
    if(b64[length - 1] === '=')
    {
        if(b64[length - 2] === '=')
        {
            // trailing bytes count is 1
            bufferLength -= 2;
        }
        else
        {
            // trailing bytes count is 2
            bufferLength -= 1;
        }
    }
        //
    
    var outputBuffer = new Uint8Array(bufferLength);
        
    var strIndex = 0;
    
    var outputIndex = 0;
    
    var c1, c2, c3, c4;
        
    for(var i = 0; i < tripletsCount - 1; ++i)
    {
        c1 = b64[strIndex];
        c2 = b64[strIndex + 1];
        c3 = b64[strIndex + 2];
        c4 = b64[strIndex + 3];
        
        strIndex += 4;
        
        var tmp = (lookup[c1] << 18) + (lookup[c2] << 12) + (lookup[c3] << 6) + lookup[c4];
        
        outputBuffer[outputIndex++] = (tmp >> 16);
        outputBuffer[outputIndex++] = ((tmp >> 8) & 0xFF);    
        outputBuffer[outputIndex++] = (tmp & 0xFF);
    }

    c1 = b64[strIndex];
    c2 = b64[strIndex + 1];
    c3 = b64[strIndex + 2];
    c4 = b64[strIndex + 3];

    var tmp = (lookup[c1] << 18) + (lookup[c2] << 12) + (lookup[c3] << 6) + lookup[c4];
    
    outputBuffer[outputIndex++] = (tmp >> 16);
    
    if(outputIndex < bufferLength)
    {
        outputBuffer[outputIndex++] = ((tmp >> 8) & 0xFF);    
    }
    
    if(outputIndex < bufferLength)
    {
        outputBuffer[outputIndex++] = (tmp & 0xFF);
    }
    
    return outputBuffer;
}
//-----------------------------------------------------------------------------
