const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// MongoDB connection with connection pooling for serverless
let cachedDb = null;

const connectToDatabase = async () => {
  if (cachedDb && mongoose.connection.readyState === 1) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  console.log('Attempting to connect to MongoDB...');
  console.log('MongoDB URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/saloon_db');

  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saloon_db', {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    cachedDb = connection;
    console.log('✅ Successfully connected to MongoDB database');
    console.log('Database name:', mongoose.connection.name);
    return connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Full error:', error);
    throw error;
  }
};

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

const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);

// Admin credentials from .env
const ADMIN_USERS = [
  {
    username: process.env.ADMIN_USERNAME_1 || 'admin1',
    password: process.env.ADMIN_PASSWORD_1 || 'password1'
  },
  {
    username: process.env.ADMIN_USERNAME_2 || 'admin2',
    password: process.env.ADMIN_PASSWORD_2 || 'password2'
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

// Middleware to ensure database connection
const ensureDbConnection = async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(500).json({ error: 'Database connection failed' });
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
app.post('/login', ensureDbConnection, (req, res) => {
  const { username, password } = req.body;
  
  // Move ADMIN_USERS inside the route to ensure fresh env vars
  const ADMIN_USERS = [
    {
      username: process.env.ADMIN_USERNAME_1 || 'admin1',
      password: process.env.ADMIN_PASSWORD_1 || 'password1'
    },
    {
      username: process.env.ADMIN_USERNAME_2 || 'admin2',
      password: process.env.ADMIN_PASSWORD_2 || 'password2'
    }
  ];
  
  // Debug logging
  console.log('Login attempt:', { username, password });
  console.log('Environment variables:', {
    ADMIN_USERNAME_1: process.env.ADMIN_USERNAME_1,
    ADMIN_PASSWORD_1: process.env.ADMIN_PASSWORD_1,
    ADMIN_USERNAME_2: process.env.ADMIN_USERNAME_2,
    ADMIN_PASSWORD_2: process.env.ADMIN_PASSWORD_2
  });
  console.log('ADMIN_USERS array:', ADMIN_USERS);
  
  const validAdmin = ADMIN_USERS.find(admin => 
    admin.username === username && admin.password === password
  );
  
  console.log('Valid admin found:', validAdmin);
  
  if (validAdmin) {
    res.cookie('isLoggedIn', 'true', { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
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

app.get('/see-recent-appointments', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'SeeRecentAppointMent', 'index.html'));
});

// API Routes

// Get all pending appointment requests
app.get('/api/requests', requireAuth, ensureDbConnection, async (req, res) => {
  try {
    const requests = await Appointment.find({ status: 'pending' })
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Accept an appointment request
app.post('/api/requests/:id/accept', requireAuth, ensureDbConnection, async (req, res) => {
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
    console.error('Error accepting appointment:', error);
    res.status(500).json({ error: 'Failed to accept appointment' });
  }
});

// Reject an appointment request
app.post('/api/requests/:id/reject', requireAuth, ensureDbConnection, async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting appointment:', error);
    res.status(500).json({ error: 'Failed to reject appointment' });
  }
});

// Get all accepted appointments
app.get('/api/appointments', requireAuth, ensureDbConnection, async (req, res) => {
  try {
    const appointments = await Appointment.find({ status: 'accepted' })
      .sort({ date: 1, time: 1 });
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Mark appointment as done
app.post('/api/appointments/:id/done', requireAuth, ensureDbConnection, async (req, res) => {
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
    console.error('Error marking appointment as done:', error);
    res.status(500).json({ error: 'Failed to mark appointment as done' });
  }
});

// Get all done appointments (for recent appointments page)
app.get('/api/recent-appointments', requireAuth, ensureDbConnection, async (req, res) => {
  try {
    const appointments = await Appointment.find({ status: 'done' })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 completed appointments
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching recent appointments:', error);
    res.status(500).json({ error: 'Failed to fetch recent appointments' });
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

// Server startup
const PORT = process.env.PORT || 3001;

// Only start the server if this file is run directly (not when imported)
if (require.main === module) {
  // Connect to database and then start the server
  connectToDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 Server is running on http://localhost:${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📁 Admin credentials loaded from environment variables`);
      });
    })
    .catch((error) => {
      console.error('❌ Failed to start server due to database connection error:', error);
      process.exit(1);
    });
}

// Export the Express API for Vercel
module.exports = app;