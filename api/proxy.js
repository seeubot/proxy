// api/proxy.js - Vercel serverless function
const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const url = req.query.url;
  
  // Validate URL parameter
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  // Simple validation - only allow terabox URLs
  if (!url.includes('terabox.com') && !url.includes('1drv.ms')) {
    return res.status(400).json({ error: 'Invalid URL domain' });
  }
  
  try {
    // Log request for debugging
    console.log(`Proxying request to: ${url}`);
    
    // Set appropriate request headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://terabox.com/'
    };
    
    // Make head request first to get content info
    let headResponse;
    try {
      headResponse = await axios.head(url, { 
        headers,
        timeout: 10000,
        validateStatus: function (status) {
          return status < 500; // Accept any status code less than 500
        }
      });

      // Forward content headers if available
      if (headResponse.headers['content-type']) {
        res.setHeader('Content-Type', headResponse.headers['content-type']);
      }
      if (headResponse.headers['content-length']) {
        res.setHeader('Content-Length', headResponse.headers['content-length']);
      }
      if (headResponse.headers['content-disposition']) {
        res.setHeader('Content-Disposition', headResponse.headers['content-disposition']);
      }
    } catch (headError) {
      console.warn('Head request failed, continuing with GET:', headError.message);
    }
    
    // Get the file content
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers,
      timeout: 30000,
      maxContentLength: Infinity,
      validateStatus: function (status) {
        return status < 500; // Accept any status code less than 500
      }
    });
    
    // Handle redirect responses
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      return res.redirect(response.headers.location);
    }
    
    // Set content type if not already set
    if (!res.getHeader('Content-Type') && response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    
    // Set content disposition header if not already set
    if (!res.getHeader('Content-Disposition') && response.headers['content-disposition']) {
      res.setHeader('Content-Disposition', response.headers['content-disposition']);
    }
    
    // Pass through data
    response.data.pipe(res);
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    // Handle various errors more gracefully
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Gateway Timeout - The request took too long to complete' });
    } else if (error.response) {
      return res.status(error.response.status).json({ 
        error: `Target server returned ${error.response.status}`,
        message: error.message
      });
    } else {
      return res.status(500).json({ 
        error: 'Proxy Server Error', 
        message: error.message
      });
    }
  }
};
