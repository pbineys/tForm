/**
 * Google Apps Script (Code.gs)
 * Web App backend to append field report submissions directly to a Google Sheet.
 * 
 * Instructions:
 * 1. Open your Google Sheet.
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any default code in the editor and paste this code.
 * 4. Click the "Save" icon (disk icon).
 * 5. Click "Deploy" > "New deployment".
 * 6. Select type "Web app".
 * 7. Set:
 *    - Description: "Field Reporting Web Form Backend"
 *    - Execute as: "Me (your email)"
 *    - Who has access: "Anyone" (This is required so the static form can submit to it without Google OAuth prompts).
 * 8. Click "Deploy".
 * 9. Copy the generated "Web app URL" and paste it into the Settings section of your Field Form app.
 */

// Name of the sheet tab where data should be appended
const SHEET_NAME = 'Field Reports';

/**
 * Handles incoming POST requests from the web application.
 */
function doPost(e) {
  try {
    // 1. Parse incoming JSON string
    if (!e || !e.postData || !e.postData.contents) {
      return makeJsonResponse('error', 'No post data content received.');
    }
    
    var data = JSON.parse(e.postData.contents);
    
    // 2. Open spreadsheet (supports both container-bound and standalone scripts)
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (err) {
      Logger.log("Container-bound check failed: " + err.toString());
    }

    // Fallback: If not container-bound, paste your Spreadsheet ID between the quotes below
    if (!ss) {
      const STANDALONE_SPREADSHEET_ID = ""; // e.g. "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
      if (STANDALONE_SPREADSHEET_ID) {
        ss = SpreadsheetApp.openById(STANDALONE_SPREADSHEET_ID);
      }
    }

    if (!ss) {
      return makeJsonResponse('error', 'Spreadsheet connection failed. If using a standalone script, please configure SPREADSHEET_ID.');
    }

    var sheet = ss.getSheetByName(SHEET_NAME);
    
    // 3. Create sheet and headers if they do not exist
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      var headers = [
        'Submission Timestamp',
        'Name of Officer',
        'Schedule',
        'Date of Visit/Activity',
        'School/Station/Office Visited',
        'Circuit/Location',
        'Activity Name',
        'Purpose of the Activity',
        'Major Activities Performed',
        'Participants Present',
        'Participants Absent',
        'Organizers',
        'Venue',
        'Topic or Area',
        'Summary of the Programme',
        'Start Date & Time',
        'Closing Time',
        'Duration',
        'Location Coordinates (Lat, Lng)',
        'GPS Accuracy',
        'Sync Timestamp'
      ];
      sheet.appendRow(headers);
      
      // Basic aesthetic styling for headers
      sheet.getRange(1, 1, 1, headers.length)
           .setFontWeight('bold')
           .setBackground('#4f46e5')
           .setFontColor('#ffffff')
           .setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    
    // 4. Map incoming fields to columns
    var rowData = [
      new Date(), // Server timestamp
      data.officerName || 'N/A',
      data.schedule || 'N/A',
      data.visitDate || 'N/A',
      data.schoolVisited || 'N/A',
      data.circuit || 'N/A',
      data.activityName || 'N/A',
      data.purpose || 'N/A',
      data.majorActivities || 'N/A',
      data.presentCount !== undefined ? data.presentCount : 'N/A',
      data.absentCount !== undefined ? data.absentCount : 'N/A',
      data.organizers || 'N/A',
      data.venue || 'N/A',
      data.topicArea || 'N/A',
      data.summary || 'N/A',
      data.startDate || 'N/A',
      data.closingTime || 'N/A',
      data.duration || 'N/A',
      data.coordinates || 'N/A',
      data.coordinatesAccuracy || 'N/A',
      data.uploadedAt || new Date().toISOString() // Upload client timestamp
    ];
    
    // 5. Append row
    sheet.appendRow(rowData);
    
    return makeJsonResponse('success', 'Report appended successfully to sheet.');
    
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return makeJsonResponse('error', 'Server error: ' + error.toString());
  }
}

/**
 * Handles CORS OPTIONS preflight request (if browser attempts it)
 */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Utility to generate a CORS-compliant JSON response
 */
function makeJsonResponse(status, message) {
  var response = {
    status: status,
    message: message
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
