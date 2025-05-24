const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saloon_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB database');
});

// Appointment Schema
const appointmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  service: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'done'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// Admin credentials from .env
const ADMIN_USERS = [
  {
    username: process.env.ADMIN_USERNAME_1 || 'admin1',
    password: process.env.ADMIN_PASSWORD_1 || 'admin123'
  },
  {
    username: process.env.ADMIN_USERNAME_2 || 'admin2',
    password: process.env.ADMIN_PASSWORD_2 || 'admin456'
  }
];

// Middleware to check if admin is logged in
const requireAuth = (req, res, next) => {
  if (req.cookies.isLoggedIn === 'true') {
    next();
  } else {
    res.redirect('/login');
  }
};

// Routes

// Login page
app.get('/login', (req, res) => {
  if (req.cookies.isLoggedIn === 'true') {
    return res.redirect('/home');
  }
  res.sendFile(path.join(__dirname, 'pages', 'login', 'login.html'));
});

// Login POST
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const validAdmin = ADMIN_USERS.find(admin => 
    admin.username === username && admin.password === password
  );
  
  if (validAdmin) {
    res.cookie('isLoggedIn', 'true', { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Home page (protected)
app.get('/home', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'home', 'home.html'));
});

// See appointment requests page (protected)
app.get('/see-requests', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'see-requests', 'see-requests.html'));
});

// See appointments page (protected)
app.get('/see-appointments', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'see-appointments', 'see-appointments.html'));
});

// API Routes

// Get all pending appointment requests
app.get('/api/requests', requireAuth, async (req, res) => {
  try {
    const requests = await Appointment.find({ status: 'pending' })
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Accept an appointment request
app.post('/api/requests/:id/accept', requireAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'accepted' },
      { new: true }
    );
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json({ success: true, appointment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept appointment' });
  }
});

// Reject an appointment request
app.post('/api/requests/:id/reject', requireAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject appointment' });
  }
});

// Get all accepted appointments
app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const appointments = await Appointment.find({ status: 'accepted' })
      .sort({ date: 1, time: 1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Mark appointment as done
app.post('/api/appointments/:id/done', requireAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'done' },
      { new: true }
    );
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json({ success: true, appointment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark appointment as done' });
  }
});

// Logout
app.post('/logout', (req, res) => {
  res.clearCookie('isLoggedIn');
  res.json({ success: true });
});

// Default route
app.get('/', (req, res) => {
  res.redirect('/login');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});