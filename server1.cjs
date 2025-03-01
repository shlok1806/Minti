const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const ICAL = require('ical.js');
const app = express();
require('dotenv').config();

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Create the 'uploads' directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads1');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer storage for ICS file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// In-memory storage for expense events
let expenseEvents = [];
// In-memory storage for calendar events from ICS files
let calendarEvents = [];

// Use the port from environment or default to 3001
const PORT = process.env.PORT || 3001;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve the uploads folder so the client can fetch ICS files
app.use('/uploads1', express.static(uploadsDir));

// ---- Helper Functions ----

// Format a number with leading zeros
function pad(num) {
  return String(num).padStart(2, '0');
}

// Format a date string to YYYYMMDD format
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${year}${month}${day}`;
}

// Get the next day from a date string
function getNextDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return formatDate(d.toISOString().split("T")[0]);
}

// Format a date object to iCalendar datetime format
function formatDateTime(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = pad(dateObj.getUTCMonth() + 1);
  const day = pad(dateObj.getUTCDate());
  const hours = pad(dateObj.getUTCHours());
  const minutes = pad(dateObj.getUTCMinutes());
  const seconds = pad(dateObj.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Build an iCalendar VEVENT block for an expense
function buildExpenseEvent(expense) {
  const uid = `expense-${expense.id}@financial-app.com`;
  const dtstamp = formatDateTime(new Date());
  const dtstart = formatDate(expense.date);
  const dtend = getNextDay(expense.date);
  const summary = `Expense: ${expense.title} ($${expense.amount}) at ${expense.location}`;
  const description = expense.description || "";
  const categories = expense.category || "";
  
  return `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART;VALUE=DATE:${dtstart}
DTEND;VALUE=DATE:${dtend}
SUMMARY:${summary}
DESCRIPTION:${description}
CATEGORIES:${categories}
END:VEVENT`;
}

// Update an ICS file with a new expense event
function updateIcsFileWithExpense(expense) {
  try {
    const files = fs.readdirSync(uploadsDir);
    const icsFiles = files.filter(f => f.toLowerCase().endsWith('.ics'));
    if (icsFiles.length === 0) {
      console.log("No ICS file found to update.");
      return;
    }
    
    const icsFilePath = path.join(uploadsDir, icsFiles[0]);
    let data = fs.readFileSync(icsFilePath, 'utf8');
    const eventStr = buildExpenseEvent(expense);
    
    // Insert the event before the END:VCALENDAR tag
    const newData = data.replace(/(END:VCALENDAR\s*)$/, eventStr + "\r\n$1");
    fs.writeFileSync(icsFilePath, newData, 'utf8');
    console.log("ICS file updated with new expense event.");
    
    // Update the in-memory calendar events
    parseAllIcsFiles();
  } catch (err) {
    console.error("Error updating ICS file:", err);
  }
}

// Parse a single ICS file
function parseIcsFile(filePath) {
  try {
    const icsData = fs.readFileSync(filePath, 'utf8');
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    const events = [];
    
    vevents.forEach(vevent => {
      try {
        const icalEvent = new ICAL.Event(vevent);
        
        // Skip events without required properties
        if (!icalEvent.summary || !icalEvent.startDate) return;
        
        const summary = icalEvent.summary;
        const description = icalEvent.description || '';
        const location = icalEvent.location || '';
        const categories = icalEvent.categories || [];
        
        // Check if this is an expense event
        const isExpense = summary.toLowerCase().includes('expense');
        
        // Extract amount if it's an expense event
        let amount = 0;
        let category = '';
        
        if (isExpense) {
          // Try to extract amount from summary
          const amountMatch = summary.match(/\$(\d+(\.\d+)?)/);
          if (amountMatch) amount = parseFloat(amountMatch[1]);
          
          // Try to extract category from categories or description
          if (categories && categories.length > 0) {
            category = categories[0];
          } else if (description.toLowerCase().includes('category:')) {
            const categoryMatch = description.match(/category:\s*([a-zA-Z]+)/i);
            if (categoryMatch) category = categoryMatch[1].toLowerCase();
          }
        }
        
        // Process event dates
        const startDate = icalEvent.startDate.toJSDate();
        const endDate = icalEvent.endDate ? icalEvent.endDate.toJSDate() : null;
        
        events.push({
          title: summary,
          description,
          location,
          start: startDate,
          end: endDate,
          isExpense,
          amount,
          category,
          isAllDay: icalEvent.isAllDay
        });
      } catch (err) {
        console.error(`Error parsing event from ${filePath}:`, err);
      }
    });
    
    return events;
  } catch (err) {
    console.error(`Error parsing ICS file ${filePath}:`, err);
    return [];
  }
}

// Parse all ICS files in the uploads directory
function parseAllIcsFiles() {
  try {
    const files = fs.readdirSync(uploadsDir);
    const icsFiles = files.filter(f => f.toLowerCase().endsWith('.ics'));
    
    // Reset the calendarEvents array
    calendarEvents = [];
    
    icsFiles.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const events = parseIcsFile(filePath);
      calendarEvents = [...calendarEvents, ...events];
    });
    
    console.log(`Parsed ${calendarEvents.length} events from ${icsFiles.length} ICS files`);
    return calendarEvents;
  } catch (err) {
    console.error("Error parsing ICS files:", err);
    return [];
  }
}

// ---- API Endpoints ----

// Handle ICS file uploads
app.post('/ICSFolder', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.json({ success: false, message: 'No files uploaded' });
  }
  
  const filePaths = req.files.map(file => `/uploads1/${file.filename}`);
  
  // Parse the uploaded ICS files
  parseAllIcsFiles();
  
  return res.json({ 
    success: true, 
    files: filePaths,
    message: `Successfully uploaded ${req.files.length} file(s)`
  });
});

// Create a new expense
app.post('/api/expenses', (req, res) => {
  const { title, amount, category, date, location, description } = req.body;
  
  // Validate required fields
  if (!title || !amount || !category || !date || !location) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields.' 
    });
  }
  
  // Create new expense object
  const newExpense = { 
    id: Date.now(), 
    title, 
    amount, 
    category, 
    date, 
    location, 
    description 
  };
  
  // Add to our expenses array
  expenseEvents.push(newExpense);
  console.log("New expense logged:", newExpense);
  
  // Update the ICS file with the new expense
  updateIcsFileWithExpense(newExpense);
  
  return res.json({ success: true, expense: newExpense });
});

// Get all expenses
app.get('/api/expenses', (req, res) => {
  return res.json({ success: true, expenses: expenseEvents });
});

// Get all calendar events
app.get('/api/calendar-events', (req, res) => {
  // Parse all ICS files to ensure we have the latest events
  parseAllIcsFiles();
  return res.json({ success: true, events: calendarEvents });
});

// Analyze expenses with AI
app.post('/api/analyze-expenses', async (req, res) => {
  try {
    // Check if we have expenses to analyze
    if (expenseEvents.length === 0) {
      return res.json({ 
        success: true, 
        analysis: "No expenses to analyze yet. Try adding some expenses first!" 
      });
    }

    // Parse all ICS files for latest data
    parseAllIcsFiles();

    // Format expenses for better readability
    const formattedExpenses = expenseEvents.map(exp => ({
      title: exp.title,
      amount: `$${exp.amount}`,
      category: exp.category,
      date: new Date(exp.date).toLocaleDateString(),
      location: exp.location
    }));

    // Create the prompt for OpenAI
    const prompt = `
      Please analyze these expenses and provide insights:
      
      ${JSON.stringify(formattedExpenses, null, 2)}
      
      Please include:
      1. Total spending by category
      2. Largest expenses
      3. Spending patterns
      4. Recommendations for budget improvements
    `;

    // Get response from OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful financial analyst assistant. The user has shared their expense data with you for analysis." 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000
    });

    return res.json({ success: true, analysis: completion.choices[0].message.content });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error analyzing expenses", 
      error: error.message 
    });
  }
});

// Save user profile
app.post('/api/profile', async (req, res) => {
  const profileData = req.body;
  
  try {
    const profilePrompt = `
      Based on this user profile, provide some helpful suggestions:
      ${JSON.stringify(profileData, null, 2)}
    `;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant providing personalized guidance." },
        { role: "user", content: profilePrompt }
      ],
      max_tokens: 1000
    });

    return res.json({ 
      success: true, 
      profile: profileData, 
      recommendations: completion.choices[0].message.content 
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error creating profile recommendations", 
      error: error.message 
    });
  }
});

// Chatbot endpoint with access to user data
app.post('/api/chatbot', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ success: false, message: 'No message provided' });
  }

  try {
    // Check if this is a greeting
    const isGreeting = /^(hi|hello|hey|greetings|howdy|what's up|good morning|good afternoon|good evening)/i.test(message.trim());
    
    if (isGreeting) {
      // Simple greeting response
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are a friendly assistant. Respond to the user's greeting warmly and briefly." 
          },
          { role: "user", content: message }
        ],
        max_tokens: 150
      });
      
      return res.json({ 
        success: true, 
        response: completion.choices[0].message.content 
      });
    }
    
    // For non-greeting messages, determine if it's about expenses or calendar
    const isExpenseQuestion = /expense|spend|cost|money|budget|payment|paid|buy|purchase|price|financial/i.test(message);
    const isCalendarQuestion = /calendar|event|schedule|appointment|meeting|upcoming|when|date|time/i.test(message);
    
    // Load the latest data
    parseAllIcsFiles();
    
    // Format data for the AI
    const formattedExpenses = expenseEvents.map(exp => ({
      title: exp.title,
      amount: `$${exp.amount}`,
      category: exp.category,
      date: new Date(exp.date).toLocaleDateString(),
      location: exp.location
    }));
    
    const formattedEvents = calendarEvents.map(event => ({
      title: event.title,
      date: new Date(event.start).toLocaleDateString(),
      time: event.isAllDay ? "All day" : new Date(event.start).toLocaleTimeString(),
      location: event.location || "No location"
    }));
    
    // Prepare context with the user's data
    let dataContext = "";
    
    if (isExpenseQuestion || isCalendarQuestion) {
      dataContext = `
        Here is your data that I can access:
        
        ${isExpenseQuestion ? `YOUR EXPENSES (${formattedExpenses.length}):
        ${JSON.stringify(formattedExpenses, null, 2)}` : ""}
        
        ${isCalendarQuestion ? `YOUR CALENDAR EVENTS (${formattedEvents.length}):
        ${JSON.stringify(formattedEvents, null, 2)}` : ""}
      `;
    }
    
    // Create the final prompt
    const userPrompt = dataContext 
      ? `${dataContext}\n\nMy question is: ${message}`
      : message;
    
    // Get response from OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: `You are a helpful assistant. The user has explicitly shared their expense and calendar data with you for this conversation.
                   You have full access to reference this data in your responses. 
                   When answering questions about expenses or calendar events, refer to specific entries by name, date, amount, etc.
                   Be conversational and helpful.` 
        },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 500
    });

    return res.json({ 
      success: true, 
      response: completion.choices[0].message.content 
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error processing chatbot request", 
      error: error.message 
    });
  }
});

// Serve the index1.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index1.html'));
});

// Parse all ICS files at startup
parseAllIcsFiles();

// Start the server
const server = app.listen(PORT, () => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("Warning: OPENAI_API_KEY environment variable is not set. OpenAI features will not work.");
  }
  console.log(`Server is running on port ${PORT}`);
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please choose a different port.`);
  } else {
    console.error('Server error:', err);
  }
});