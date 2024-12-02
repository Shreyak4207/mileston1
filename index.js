const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cron = require('node-cron');
const WebSocket = require('ws');

// Initialize the app
const app = express();
app.use(bodyParser.json());

// WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// In-memory event storage
let events = [];

// Load initial events from `events.json` if exists
if (fs.existsSync('events.json')) {
    events = JSON.parse(fs.readFileSync('events.json'));
}

// Utility to save events to file
const saveEvents = () => {
    fs.writeFileSync('events.json', JSON.stringify(events, null, 2));
};

// Endpoint: Add Event
app.post('/events', (req, res) => {
    const { title, description, time } = req.body;
    if (!title || !time) {
        return res.status(400).send('Title and time are required.');
    }

    const newEvent = { id: Date.now(), title, description, time: new Date(time).toISOString() };
    events.push(newEvent);
    events.sort((a, b) => new Date(a.time) - new Date(b.time));
    saveEvents();

    res.status(201).send({ message: 'Event added', event: newEvent });
});

// Endpoint: Get Events
app.get('/events', (req, res) => {
    const upcomingEvents = events.filter(event => new Date(event.time) > new Date());
    res.send(upcomingEvents);
});

// Notify users via WebSocket
const notifyClients = (message) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
};

// Cron job to check for notifications and handle events
cron.schedule('* * * * *', () => {
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

    events.forEach((event, index) => {
        const eventTime = new Date(event.time);

        if (eventTime <= now) {
            // Log completed events
            fs.appendFileSync('completedEvents.log', `Event Completed: ${JSON.stringify(event)}\n`);
            events.splice(index, 1); // Remove from active events
            saveEvents();
        } else if (eventTime <= fiveMinutesLater) {
            notifyClients({ type: 'reminder', event });
        }
    });
});

// WebSocket: Notify for overlapping events
wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'info', message: 'Connected to real-time notifications.' }));

    // Check for overlapping events
    const overlappingEvents = events.filter((event, i) =>
        events.some((e, j) => i !== j && Math.abs(new Date(event.time) - new Date(e.time)) < 5 * 60 * 1000)
    );

    if (overlappingEvents.length) {
        ws.send(JSON.stringify({ type: 'warning', overlappingEvents }));
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`WebSocket is running on ws://localhost:8080`);
});
