let {base64decode} = require('nodejs-base64');
const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
/**
 * Decodes a url safe Base64 string to its original representation.
 * @param  {string} string
 * @return {string}
 */
function urlB64Decode(string) {
  return string
   ? entities.encodeNonASCII(base64decode(string.replace(/\-/g, '+').replace(/\_/g, '/'))).replace(/[\u00A0|\u2007|\u202F]/g,' ')
   : '';
}

/**
 * Takes the header array filled with objects and transforms it into a more
 * pleasant key-value object.
 * @param  {array} headers
 * @return {object}
 */
function indexHeaders(headers) {
  if (!headers) {
    return {};
  } else {
    return headers.reduce(function (result, header) {
      result[header.name.toLowerCase()] = header.value;
      return result;
    }, {});
  }
}

/**
 * Takes a response from the Gmail API's GET message method and extracts all
 * the relevant data.
 * @param  {object} response
 * @return {object}
 */
module.exports = function parseMessage(response) {
  var result = {
    id: response.id,
    threadId: response.threadId,
    labelIds: response.labelIds,
    snippet: response.snippet,
    historyId: response.historyId,
    textHtml:''
  };
  if (response.internalDate) {
    result.internalDate = parseInt(response.internalDate);
  }

  var payload = response.payload;
  if (!payload) {
    return result;
  }
  var headers = indexHeaders(payload.headers);
  result.headers = headers;


  if (payload.mimeType == 'text/plain'){
    result.textHtml = payload.body.data ? urlB64Decode(payload.body.data).replace(/\n/g, '</br>').replace(/\r/g, '</br>') : '';
    result.textPlain = result.textHtml;
    return result;
  }

  var parts = [payload];
  var firstPartProcessed = false;
  let isAlternatePart = false;
  let isMixedPart = false;

  while (parts.length !== 0) {
    var part = parts.shift();
    if (part.parts) {
      parts = parts.concat(part.parts);
    }
    if (firstPartProcessed) {
      headers = indexHeaders(part.headers);
    }

    var isHtml = part.mimeType && part.mimeType.indexOf('text/html') !== -1;
    var isPlain = part.mimeType && part.mimeType.indexOf('text/plain') !== -1;
    if (!isAlternatePart) {
      isAlternatePart = part.mimeType &&
          part.mimeType.indexOf('multipart/alternative') !== -1;
    }
    if (!isMixedPart) {
      isMixedPart = part.mimeType &&
          part.mimeType.indexOf('multipart/mixed') !== -1;
    }
    var isAttachment = false;
    if(part.body.attachmentId || (headers['content-disposition'] && (headers['content-disposition'].indexOf('attachment') !== -1 || headers['content-disposition'].indexOf('inline') !== -1 ))) {
      isAttachment = true;
    } else if(headers['content-type'] && (headers['content-type'].indexOf('image') >= 0 || headers['content-type'].indexOf('img') >= 0)){
	    isAttachment = true;
	    headers['content-disposition'] = 'inline';
    }

    if (isHtml && (!isAttachment || (isAttachment && !part.filename))) {
	    if(part.body.data){ 
      		result.textHtml += urlB64Decode(part.body.data);
	    } else if (part.body.atttachmentId) {
		result.textHtmlAttachmentId = part.body.attachmentId;    
	    }
    } else if (isPlain && !isAttachment) {
        if(result.textPlain)
            result.textPlain += urlB64Decode(part.body.data);
        else
            result.textPlain = urlB64Decode(part.body.data);
    } else if (isAttachment) {
      var body = part.body;
      if(!result.attachments) {
        result.attachments = [];
      }
      result.attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: body.size,
        attachmentId: body.attachmentId,
        contentId:headers['content-id']?headers['content-id'].replace(/<|>/g,''):'',
        contentDisposition:headers['content-disposition'] && headers['content-disposition'].indexOf('inline') !== -1?'inline':'attachment',
        contentType:headers['content-type']
      });

    }

    firstPartProcessed = true;
  }
  if(!isAlternatePart && isMixedPart){
    const textBody = result.textPlain ? result.textPlain.replace(/\n/g, '</br>').replace(/\r/g, '</br>').replace(/\t/g, '        ') : '';
    result.textHtml = `<p>${textBody}</p>${result.textHtml}`;
  }

  return result;
};
