//-----------------------------------------------------------------------------

var https = require('https');
var url = require('url');

var shelp = require('./stream-helpers.js');
var base64 = require('./base64.js');

//-----------------------------------------------------------------------------

function YadClient(yadToken)
{
    this.yadToken = yadToken;
    
    this.yadAuth = 'OAuth ' + yadToken;

    this.yadApiHeaders = 
    {
        'Authorization': this.yadAuth,
        'Accept' : 'application/json',
        'Content-Type': 'application/json'
    };

    this.yadHost = 'https://cloud-api.yandex.net';    
    this.pathPrefix = 'app:/';
}

//-----------------------------------------------------------------------------

YadClient.prototype.writeFile = function(path, asBinaryContent, content, callback)
{
    var reqUrl = this.yadHost + '/v1/disk/resources/upload/?path=app:/' + path;
    
    this.reqHelper('GET', reqUrl, this.yadApiHeaders, content, function(err, reply){
        
        if(err)
        {
            callback(err, reply);
        }
        else
        {
            var replyObject = JSON.parse(reply);
            
            if(replyObject.error)
            {
                callback(err, reply); 
            }
            else
            {
                    // upload content to the specified URL
                    
                YadClient.prototype.reqHelperUploadDownload(replyObject.method, replyObject.href, asBinaryContent, content, function(err, reply){

                    callback(err, reply);    
                });
            }
        }
    });   
}

//-----------------------------------------------------------------------------

YadClient.prototype.readFile = function(path, asBinaryContent, callback)
{
    var reqUrl = this.yadHost + '/v1/disk/resources/download/?path=app:/' + path;     
        
    this.reqHelper('GET', reqUrl, this.yadApiHeaders, null, function(err, reply){
        
        if(err)
        {
            callback(err, reply);
        }
        else
        {
            var replyObject = JSON.parse(reply);
            
            if(replyObject.error)
            {
                callback(err, reply); 
            }
            else
            {
                    // download content from the specified URL
                    
                YadClient.prototype.reqHelperUploadDownload(replyObject.method, replyObject.href, asBinaryContent, null, function(err, reply){

                    callback(err, reply);    
                });
            }
        }
    });
}

//-----------------------------------------------------------------------------

YadClient.prototype.createFolder = function(path, callback)
{
    var reqUrl = this.yadHost + '/v1/disk/resources/?path=app:/' + path;    

    this.reqHelper('PUT', reqUrl, this.yadApiHeaders, null, callback);
}

//-----------------------------------------------------------------------------

YadClient.prototype.deleteElement = function(path, callback)
{
    var reqUrl = this.yadHost + '/v1/disk/resources/?path=app:/' + path + '&permanently=true';    

    this.reqHelper('DELETE', reqUrl, this.yadApiHeaders, null, callback);
}

//-----------------------------------------------------------------------------

YadClient.prototype.moveElement = function(pathFrom, pathTo, callback)
{
    var reqUrl = this.yadHost + '/v1/disk/resources/move/?from=app:/' + pathFrom + '&path=app:/' + pathTo;
    
    this.reqHelper('POST', reqUrl, this.yadApiHeaders, null, callback);
}

//-----------------------------------------------------------------------------

YadClient.prototype.listElements = function(path, fields, limit, offset, callback)
{
    var fieldsStr = '&fields=';
    
    var lastFieldIndex = fields.length - 1;
    
    for(var i = 0; i < lastFieldIndex; ++i)
    {
        fieldsStr += fields[i] + ',';
    }
    
    fieldsStr += fields[lastFieldIndex];
    
    var reqUrl = this.yadHost + '/v1/disk/resources/?path=app:/' + path + fieldsStr + '&limit=' + limit + '&offset=' + offset;    
    
    this.reqHelper('GET', reqUrl, this.yadApiHeaders, null, callback);
}

//-----------------------------------------------------------------------------

YadClient.prototype.reqHelper = function(method, reqUrl, headers, content, callback)
{
    var parsedUrl = url.parse(reqUrl);
    
    var req = https.request({
        hostname: parsedUrl.hostname, 
        path: parsedUrl.path,
        method: method,
        headers: headers
    });

    req.once('error', function(e){
        callback(e, null);
    });
    
    req.once('response', function(res){
        
        if(res.statusCode < 300)
        {
            shelp.asyncReadTextStream(res, function(responseData){
                
                callback(null, responseData);    
            });
        }
        else if(res.headers["location"])
        {
            YadClient.prototype.reqHelper(method, res.headers["location"], headers, content, callback);            
        }
        else
        {
            callback({statusCode: res.statusCode}, null);
        }
    });
    
    if(content)
    {
        req.write(content);
    }
    
    req.end();
}

//-----------------------------------------------------------------------------

YadClient.prototype.reqHelperUploadDownload = function(method, reqUrl, asBinaryContent, content, callback)
{
    var parsedUrl = url.parse(reqUrl);
    
    var contentType = asBinaryContent ? 'application/octet-stream' : 'text/plain; charset=user-defined';
    
    var req = https.request({
        hostname: parsedUrl.hostname, 
        path: parsedUrl.path,
        method: method,
        headers: content ? {'Content-Type': contentType} : {'Accept': contentType}
    });
    
    req.once('error', function(e){
        callback(e, null);
    });
    
    req.once('response', function(res){
        
        if(res.statusCode < 300)
        {
            if(content)
            {
                    // make no conversion, just use the response
                shelp.asyncReadTextStream(res, function(responseData){
                    
                    callback(null, responseData);    
                });
            }
            else
            {
                    // we are downloading, use proper conversion
                var actualReadFunc = asBinaryContent ? shelp.asyncReadBinaryStream : shelp.asyncReadTextStream;
                
                actualReadFunc(res, function(responseData){
                    
                    if(asBinaryContent)
                    {
                        var b64 = base64.binToBase64(responseData);
                        callback(null, b64);
                    }
                    else
                    {
                        callback(null, responseData);        
                    }
                });
            }
        }
        else if(res.headers["location"])
        {
            YadClient.prototype.reqHelperUploadDownload(method, res.headers["location"], asBinaryContent, content, callback);            
        }
        else
        {
            callback({statusCode: res.statusCode}, null);
        }
    });
    
    if(content)
    {
            // to do: workaround 'drain' for writing (upload content may be huge)
        
        if(asBinaryContent)
        {
            var binBuffer = base64.base64ToBin(content);
            req.write(binBuffer);
        }
        else
        {
            req.write(content);    
        }
    }
    
    req.end();
}

//-----------------------------------------------------------------------------

exports.createClient = function(yadToken)
{
    return new YadClient(yadToken);    
}

//-----------------------------------------------------------------------------
