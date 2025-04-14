const mongoose = require('mongoose');

// We're not actually storing logs, just creating a schema for reference
const requestLogSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  },
  url: {
    type: String,
    required: true
  },
  status: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Instead of exporting the model, we'll export a logging function
const logRequest = (method, url, status) => {
  console.log(`[API Request] ${method} ${url} - Status: ${status}`);
};

module.exports = {
  logRequest,
  // Keep the model around in case we want to use it later
  RequestLog: mongoose.model('RequestLog', requestLogSchema)
};