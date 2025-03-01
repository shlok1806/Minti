document.addEventListener('DOMContentLoaded', function () {
  console.log("[DEBUG] DOM fully loaded, initializing FullCalendar");

  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) {
    console.error("[DEBUG] #calendar element not found!");
    return;
  }

  // Initialize FullCalendar with today's date instead of fixed date
  console.log("[DEBUG] Creating FullCalendar instance");
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: 600,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    editable: true,
    dayMaxEvents: true, // allow "more" link when too many events
    events: [
      {
        title: 'Sample Event',
        start: '2025-03-05T10:00:00',
        end: '2025-03-05T12:00:00',
        color: '#60A5FA'
      }
    ]
  });

  try {
    calendar.render();
    console.log("[DEBUG] Calendar rendered successfully");
  } catch (err) {
    console.error("[DEBUG] Error rendering calendar:", err);
  }

  // ICS Upload with improved error handling and recurring event support
  document.getElementById('uploadForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const files = document.getElementById('upload').files;
    if (files.length === 0) {
      alert('Please upload at least one .ics file');
      return;
    }

    // Create FormData to send to the server
    const formData = new FormData();
    Array.from(files).forEach(file => {
      if (!file.name.endsWith('.ics')) {
        alert(`"${file.name}" is not a valid .ics file`);
        return;
      }
      formData.append('files', file);
    });
    
    // Send to server API
    fetch('/ICSFolder', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Now parse the files locally as well for the calendar display
        Array.from(files).forEach(file => {
          const reader = new FileReader();
          reader.onload = function (e) {
            const icsData = e.target.result;
            console.log(`[DEBUG] File "${file.name}" loaded, parsing...`);
            try {
              const events = parseICS(icsData);
              console.log(`[DEBUG] ICS parse result for "${file.name}":`, events);
              if (events.length > 0) {
                calendar.addEventSource(events);
                alert(`Added ${events.length} events from ${file.name}`);
              } else {
                alert(`No events found in "${file.name}"`);
              }
            } catch (parseErr) {
              console.error("[DEBUG] Error parsing ICS:", parseErr);
              alert(`Error parsing "${file.name}": ${parseErr.message}`);
            }
          };
          reader.readAsText(file);
        });
      } else {
        alert("Failed to upload files to server");
      }
    })
    .catch(error => {
      console.error("[DEBUG] Error uploading files:", error);
      alert("Error uploading files to server. Check console for details.");
    });
  });

  // Expense Form with server update
  document.getElementById('expenseForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const title = document.getElementById('expense-title').value;
    const amount = document.getElementById('expense-amount').value;
    const category = document.getElementById('expense-category').value.trim().toLowerCase();
    const date = document.getElementById('expense-date').value;
    const location = document.getElementById('expense-location').value;
    const description = document.getElementById('expense-description').value;

    console.log("[DEBUG] Adding expense:", { title, amount, category, date, location, description });

    let eventColor = '#60A5FA'; // default pastel blue
    if (category === 'food') {
      eventColor = '#F87171';
    } else if (category === 'transportation') {
      eventColor = '#34D399';
    } else if (category === 'utilities') {
      eventColor = '#FBBF24';
    } else if (category === 'entertainment') {
      eventColor = '#A78BFA';
    }
    
    // First add to local calendar
    const newEvent = {
      title: `${title} ($${amount}) @ ${location}`,
      start: date,
      allDay: true,
      color: eventColor,
      extendedProps: {
        description: description,
        category: category
      }
    };
    calendar.addEvent(newEvent);
    
    // Then send to server
    fetch('/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        amount,
        category,
        date,
        location,
        description
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log("[DEBUG] Expense saved to server:", data);
      } else {
        console.error("[DEBUG] Error saving expense to server:", data);
      }
    })
    .catch(error => {
      console.error("[DEBUG] Fetch error:", error);
    });
    
    alert("Expense added to calendar!");
    document.getElementById('expenseForm').reset();
  });

  // Profile (no changes needed)
  document.getElementById('profileForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const name = document.getElementById('user-name').value;
    const email = document.getElementById('user-email').value;
    const preferences = document.getElementById('user-preferences').value;
    
    // Prepare data to send to the server
    const profileData = { name, email, preferences };
    
    // Store locally and also send to server API
    localStorage.setItem('userProfile', JSON.stringify(profileData));
    
    // Send to server API
    fetch('/api/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("Profile saved!");
        console.log("[DEBUG] Profile saved:", data);
      } else {
        alert("Error saving profile");
        console.error("[DEBUG] Error saving profile:", data);
      }
    })
    .catch(error => {
      console.error("[DEBUG] Fetch error:", error);
      alert("Profile saved locally only. Server connection failed.");
    });

    // send profile to Nessie (handled by nessie_postdata.py)
    fetch('/save_profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log("[DEBUG] Profile also saved to Nessie:", data);
      } else {
        console.error("[DEBUG] Error saving profile to Nessie:", data);
      }
    })
    .catch(error => {
      console.error("[DEBUG] Fetch error (Nessie):", error);
    });

  });

  // Load any existing profile
  const savedProfile = localStorage.getItem('userProfile');
  if (savedProfile) {
    try {
      const p = JSON.parse(savedProfile);
      document.getElementById('user-name').value = p.name || '';
      document.getElementById('user-email').value = p.email || '';
      document.getElementById('user-preferences').value = p.preferences || '';
    } catch (err) {
      console.warn("[DEBUG] Error loading saved profile:", err);
    }
  }

  // Add a button to analyze expenses with AI
  const chatContainer = document.getElementById('chatbot').parentElement;
  if (chatContainer) {
    const analyzeBtn = document.createElement('button');
    analyzeBtn.textContent = 'Analyze My Expenses';
    analyzeBtn.className = 'mb-4 py-2 px-4 bg-accent hover:bg-blue-600 text-gray-900 font-semibold rounded-md shadow transition w-full';
    analyzeBtn.addEventListener('click', analyzeExpenses);
    chatContainer.insertBefore(analyzeBtn, document.getElementById('chatbot'));
  }
  
  function analyzeExpenses() {
    // Show typing indicator
    const typingIndicator = document.createElement('p');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.className = 'italic text-gray-400 mb-2';
    typingIndicator.textContent = "Analyzing your expenses...";
    document.getElementById('chatbot').appendChild(typingIndicator);
    
    fetch('/api/analyze-expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    .then(response => response.json())
    .then(data => {
      // Remove typing indicator
      const indicator = document.getElementById('typing-indicator');
      if (indicator) indicator.remove();
      
      if (data.success) {
        appendChatMessage("Advisor", data.analysis);
      } else {
        appendChatMessage("Advisor", "Sorry, I couldn't analyze your expenses at this time.");
        console.error("[DEBUG] API error:", data);
      }
    })
    .catch(error => {
      console.error('[DEBUG] Fetch error:', error);
      // Remove typing indicator
      const indicator = document.getElementById('typing-indicator');
      if (indicator) indicator.remove();
      
      appendChatMessage("Advisor", "Sorry, I couldn't connect to the server to analyze your expenses.");
    });
  }

  // Updated Chatbot to use the server API
  function sendChatMessage() {
    const inputEl = document.getElementById('chatbot-input');
    const userMessage = inputEl.value.trim();
    if (!userMessage) return;
    
    appendChatMessage("You", userMessage);
    inputEl.value = '';
    
    // Show typing indicator
    const typingIndicator = document.createElement('p');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.className = 'italic text-gray-400 mb-2';
    typingIndicator.textContent = "Advisor is typing...";
    document.getElementById('chatbot').appendChild(typingIndicator);
    
    // Call the server API
    fetch('/api/chatbot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: userMessage })
    })
    .then(response => response.json())
    .then(data => {
      // Remove typing indicator
      const indicator = document.getElementById('typing-indicator');
      if (indicator) indicator.remove();
      
      if (data.success) {
        appendChatMessage("Advisor", data.response);
      } else {
        appendChatMessage("Advisor", "Sorry, I encountered an error. Please try again.");
        console.error("[DEBUG] API error:", data);
      }
    })
    .catch(error => {
      console.error('[DEBUG] Fetch error:', error);
      // Remove typing indicator
      const indicator = document.getElementById('typing-indicator');
      if (indicator) indicator.remove();
      
      // Fallback to local response
      useLocalChatbotFallback(userMessage);
    });
  }
  
  // Fallback function for when server is unavailable
  function useLocalChatbotFallback(userMessage) {
    console.log("[DEBUG] Using local chatbot fallback");
    const autoReplies = [
      "Hello! How can I help you today?",
      "Hi there! What would you like to know?",
      "I'm here to assist you with your questions.",
      "I'm having trouble connecting to the server, but I'm here to help."
    ];
    const randomReply = autoReplies[Math.floor(Math.random() * autoReplies.length)];
    appendChatMessage("Advisor", randomReply);
  }

  document.getElementById('chatbot-send').addEventListener('click', sendChatMessage);
  document.getElementById('chatbot-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });

  function appendChatMessage(sender, text) {
    const chatDiv = document.getElementById('chatbot');
    const msgEl = document.createElement('p');
    msgEl.innerHTML = `<strong>${sender}:</strong> ${text}`;
    msgEl.className = 'mb-2';
    chatDiv.appendChild(msgEl);
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }

  // Enhanced ICS parsing function with robust recurring event support
  function parseICS(icsData) {
    try {
      // Try to parse the ICS data
      let jcalData;
      try {
        jcalData = ICAL.parse(icsData);
      } catch (parseError) {
        console.error("[DEBUG] ICAL.parse error:", parseError);
        throw new Error("Failed to parse ICS format. The file may be corrupted or not a valid ICS file.");
      }
      
      // Create a component from the parsed data
      const comp = new ICAL.Component(jcalData);
      
      // Get all events
      const vevents = comp.getAllSubcomponents('vevent');
      if (!vevents || vevents.length === 0) {
        console.warn("[DEBUG] No events found in ICS data");
        return [];
      }
      
      console.log(`[DEBUG] Found ${vevents.length} events in ICS file`);
      let events = [];
      
      // Current date and 1 year forward/backward range for recurring events
      const now = new Date();
      const rangeStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      const rangeEnd = new Date(now.getFullYear() + 1, now.getMonth() + 1, 0);
      
      // Process each event
      vevents.forEach((vevent, index) => {
        try {
          const icalEvent = new ICAL.Event(vevent);
          
          // Basic event properties
          const summary = icalEvent.summary || "No Title";
          const location = icalEvent.location || '';
          const description = icalEvent.description || '';
          const isAllDay = icalEvent.isAllDay;
          
          // Check if the event has a start date
          if (!icalEvent.startDate) {
            console.warn(`[DEBUG] Event ${index} (${summary}) has no start date, skipping`);
            return; // Skip this event
          }
          
          // Process a recurring event
          if (icalEvent.isRecurring()) {
            console.log(`[DEBUG] Processing recurring event: ${summary}`);
            
            // Get recurrence rules
            const rrule = icalEvent.component.getFirstPropertyValue('rrule');
            if (rrule) {
              console.log(`[DEBUG] Recurrence rule:`, rrule);
            }
            
            // Create an event iterator in the range we care about
            const rangeStartICal = ICAL.Time.fromJSDate(rangeStart);
            try {
              // Create a recur expansion to get all occurrences
              const iterator = icalEvent.iterator();
              let maxOccurrences = 100; // Reasonable limit to prevent infinite loops
              let occurrenceCount = 0;
              let next;
              
              // Iterate through occurrences up to our max limit
              while ((next = iterator.next()) && occurrenceCount < maxOccurrences) {
                try {
                  // Skip occurrences before our range start
                  if (next.compare(rangeStartICal) < 0) {
                    continue;
                  }
                  
                  // Get occurrence details
                  const occurrence = icalEvent.getOccurrenceDetails(next);
                  
                  // Convert to JS dates for FullCalendar
                  const startDate = occurrence.startDate.toJSDate();
                  const endDate = occurrence.endDate ? occurrence.endDate.toJSDate() : null;
                  
                  // Create a FullCalendar event
                  events.push({
                    title: summary,
                    start: startDate,
                    end: endDate,
                    allDay: isAllDay,
                    location: location,
                    description: description,
                    rrule: true // Flag as a recurring event instance
                  });
                  
                  occurrenceCount++;
                  
                  // Optional: Stop if we're past our range end
                  if (startDate > rangeEnd) {
                    break;
                  }
                } catch (occErr) {
                  console.warn(`[DEBUG] Error processing occurrence:`, occErr);
                }
              }
              
              console.log(`[DEBUG] Generated ${occurrenceCount} occurrences for recurring event: ${summary}`);
            } catch (recurErr) {
              console.warn(`[DEBUG] Error processing recurrence pattern for event ${index}:`, recurErr);
              
              // Fallback to adding at least the base event if recurrence processing fails
              try {
                const startDate = icalEvent.startDate.toJSDate();
                const endDate = icalEvent.endDate ? icalEvent.endDate.toJSDate() : null;
                
                events.push({
                  title: `${summary} (Recurring)`,
                  start: startDate, 
                  end: endDate,
                  allDay: isAllDay,
                  location: location,
                  description: description
                });
              } catch (fallbackErr) {
                console.error(`[DEBUG] Even fallback failed for event ${index}:`, fallbackErr);
              }
            }
          } else {
            // Process a non-recurring event
            console.log(`[DEBUG] Processing single event: ${summary}`);
            
            const startDate = icalEvent.startDate.toJSDate();
            const endDate = icalEvent.endDate ? icalEvent.endDate.toJSDate() : null;
            
            events.push({
              title: summary,
              start: startDate,
              end: endDate,
              allDay: isAllDay,
              location: location,
              description: description
            });
          }
        } catch (eventError) {
          console.warn(`[DEBUG] Error processing event ${index}:`, eventError);
        }
      });
      
      console.log(`[DEBUG] Successfully processed ${events.length} events (including recurring instances)`);
      return events;
    } catch (error) {
      console.error("[DEBUG] Error in parseICS:", error);
      throw error;
    }
  }
});