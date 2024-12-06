const express = require('express');
const bodyParser = require('body-parser'); // Optional: if using express.json()
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session'); 
const { Task } = require('./models/task');
const cors = require('cors');
const multer = require('multer');


// const multer = require('multer');
//const upload = multer({ storage: multer.memoryStorage() }); // or specify a disk storage
const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'vamps',
    password: '666',  
    port: 61203,
});

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});
const upload = multer({ storage: storage });
const uploadMultiple = multer({
    storage: storage, // Already defined in your code
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
}).array('files', 5); // Allow up to 5 files per request

app.use(cors());
app.use('/uploads', express.static('uploads'));


const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your_jwt_secret';
// Function to extract user ID from JWT token
function getUserIdFromToken(token) {
    if (!token) {
        throw new Error('No token provided');
    }

    try {
        // Decode the JWT token using the secret key
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.id; // Assuming the token payload contains the user ID as `id`
    } catch (err) {
        throw new Error('Invalid token');
    }
}



// Middleware
app.use(express.json()); // To parse JSON bodies
function authenticateUser(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check if the user is approved
const checkApproval = async (req, res, next) => {
    const userId = req.session.userId; // Adjust this according to your session handling
    if (!userId) {
        return res.status(403).json({ message: 'User not logged in.' });
    }

    try {
        const user = await pool.query('SELECT is_approved FROM school WHERE id = $1', [userId]);

        if (user.rows.length > 0 && !user.rows[0].is_approved) {
            return res.status(403).json({ message: 'Wait for admin approval to enter the website.' });
        }

        next(); // Proceed to the next middleware or route handler if approved
    } catch (error) {
        console.error('Error checking approval:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// Route to serve signupschool.html


app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signupschool.html'));
});
// Route to serve main.html, protected by checkApproval middleware
app.get('/main', checkApproval, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html')); // Serve your main site
});
//QUERIES
// Route to register a new company
app.post('/register-company', async (req, res) => {
    const { email, password, name, address, contact } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO company_requests (email, password, name, address, contact, status) VALUES ($1, $2, $3, $4, $5, $6)';
        await pool.query(query, [email, hashedPassword, name, address, contact, 'pending']);
        res.status(201).json({ message: 'Registration successful! Awaiting admin approval.' });
    } catch (error) {
        console.error('Error registering company:', error);
        res.status(500).json({ error: 'Error registering company.' });
    }
});


// Register a new school
app.post('/register', async (req, res) => {
    const { email, password, name, address } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO school_requests (email,password, name, address, status) VALUES ($1, $2, $3, $4, $5)';
        await pool.query(query, [email, hashedPassword, name, address, 'pending']);
        res.status(201).json({ message: 'Registration successful! Awaiting admin approval.' });
    } catch (error) {
        console.error('Error registering school:', error);
        res.status(500).json({ error: 'Error registering school.' });
    }
});

// Route to register a new intern
app.post('/register-intern', async (req, res) => {
    const { email, password, name, address, school_id } = req.body;

    if (!name || !email || !password || !school_id) {
        return res.status(400).json({ error: 'Name, email, password, and school ID are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO intern_requests (email, password, name, address, school_id, status) VALUES ($1, $2, $3, $4, $5, $6)';
        await pool.query(query, [email, hashedPassword, name, address, school_id, 'pending']);
        res.status(201).json({ message: 'Intern registration successful! Awaiting admin approval.' });
    } catch (error) {
        console.error('Error registering intern:', error);
        res.status(500).json({ error: 'Error registering intern.' });
    }
});



// Admin: Approve or reject a request 
app.put('/admin/requests/:id', async (req, res) => {
    const { status, type } = req.body; // Expecting { status: 'approved', type: 'school' } or { status: 'rejected', type: 'company' }
    const requestId = req.params.id;

    // Determine which table to use based on request type
    const tableName = type === 'school' ? 'school_requests' : 'company_requests';

    try {
        // Update the request status
        await pool.query(`UPDATE ${tableName} SET status = $1 WHERE id = $2`, [status, requestId]);

        // Fetch request data for further actions
        const requestData = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [requestId]).then(res => res.rows[0]);

        if (status === 'approved') {
            const existingEntry = await pool.query(`SELECT * FROM ${type} WHERE email = $1`, [requestData.email]);

            if (existingEntry.rows.length > 0) {
                // Update existing entry to set approval status
                await pool.query(`UPDATE ${type} SET is_approved = true WHERE email = $1`, [requestData.email]);
            } else {
                // Insert new entry into the main table with approval status set
                await pool.query(`INSERT INTO ${type} (email, password, name, address${type === 'company' ? ', contact' : ''}, is_approved) VALUES ($1, $2, $3, $4${type === 'company' ? ', $5' : ''}, true)`,
                    type === 'company'
                        ? [requestData.email, requestData.password, requestData.name, requestData.address, requestData.contact]
                        : [requestData.email, requestData.password, requestData.name, requestData.address]
                );
            }
        } else if (status === 'rejected') {
            const existingEntry = await pool.query(`SELECT * FROM ${type} WHERE email = $1`, [requestData.email]);
            if (existingEntry.rows.length > 0) {
                await pool.query(`UPDATE ${type} SET is_approved = false WHERE email = $1`, [requestData.email]);
            }
        }

        res.status(200).json({ message: `Request ${status}.` });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Error updating request status.' });
    }
});

//School : Approve or reject intern request
app.put('/school/requests/:id', async (req, res) => {
    const { status } = req.body; // Expecting { status: 'approved' } or { status: 'rejected' }
    const requestId = req.params.id;
    const type = 'intern';

    try {
        await pool.query(`UPDATE intern_requests SET status = $1 WHERE id = $2`, [status, requestId]);

        // Fetch request data for further actions
        const requestData = await pool.query(`SELECT * FROM intern_requests WHERE id = $1`, [requestId]).then(res => res.rows[0]);

        if (status === 'approved') {
            const existingEntry = await pool.query(`SELECT * FROM intern WHERE email = $1`, [requestData.email]);

            if (existingEntry.rows.length > 0) {
                // Update existing entry to set approval status
                await pool.query(`UPDATE intern SET is_approved = true WHERE email = $1`, [requestData.email]);
            } else {
                // Insert new entry into the school table with approval status set
                await pool.query(`INSERT INTO intern (email, password, name, address,school_id, is_approved) VALUES ($1, $2, $3, $4,$5, true)`,
                    [requestData.email, requestData.password, requestData.name, requestData.address, requestData.school_id]
                );
            }
        } else if (status === 'rejected') {
            const existingEntry = await pool.query(`SELECT * FROM intern WHERE email = $1`, [requestData.email]);
            if (existingEntry.rows.length > 0) {
                await pool.query(`UPDATE intern SET is_approved = false WHERE email = $1`, [requestData.email]);
            }
        }

        res.status(200).json({ message: `Request ${status}.` });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Error updating request status.' });
    }
});


// Update request status
app.put('/admin/requests/:id', async (req, res) => {
    const { id } = req.params;
    const { status, type } = req.body;

    const tableName = type === 'school' ? 'school_requests' : 'company_requests';

    try {
        const result = await pool.query(`UPDATE ${tableName} SET status = $1 WHERE id = $2`, [status, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Request not found' });
        }

        res.json({ message: 'Request updated successfully' });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Fetch users
app.get('/api/schools', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, email, address FROM school WHERE is_approved = true');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching school users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/company', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, email, address,contact FROM company WHERE is_approved = true');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching company users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/intern', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, email, address,school_id FROM intern WHERE is_approved = true');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching intern users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Fetch school requests
app.get('/admin/school-requests', async (req, res) => {
    const result = await pool.query('SELECT * FROM school_requests WHERE status = $1', ['pending']);
    res.json(result.rows);
});
// Fetch company requests
app.get('/admin/company-requests', async (req, res) => {
    const result = await pool.query('SELECT * FROM company_requests WHERE status = $1', ['pending']);
    res.json(result.rows);
});
// Fetch intern requests
app.get('/school/intern-requests', async (req, res) => {
    const result = await pool.query('SELECT * FROM intern_requests WHERE status = $1', ['pending']);
    res.json(result.rows);
});


//TOTAL SCHOOL, COMPANY, INTERN COUNT
app.get('/api/schools/count', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM school'); 
        res.json({ total: result.rows[0].count });
    } catch (error) {
        console.error('Error fetching school count:', error);
        res.status(500).send('Server Error');
    }
});
app.get('/api/company/count', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM company');
        res.json({ total: result.rows[0].count });
    } catch (error) {
        console.error('Error fetching company count:', error);
        res.status(500).send('Server Error');
    }
});
app.get('/api/intern/count', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM intern');
        res.json({ total: result.rows[0].count });
    } catch (error) {
        console.error('Error fetching intern count:', error);
        res.status(500).send('Server Error');
    }
});


// Login Route
// index.js (Login Route with debugging)
app.post('/login', async (req, res) => {
    const { email, password, userType } = req.body;

    try {
        // Determine the query based on userType
        const userQuery = userType === 'school'
            ? 'SELECT * FROM school WHERE email = $1'
            : userType === 'company'
                ? 'SELECT * FROM company WHERE email = $1'
                : 'SELECT * FROM intern WHERE email = $1';

        const userResult = await pool.query(userQuery, [email]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = userResult.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Set the user ID and type in the session
        req.session.userId = user.id;
        req.session.userType = userType;

        // Save session and check for errors
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);          
                return res.status(500).json({ error: 'Session error' });
            }

            // Redirect based on user type
            const redirectUrl = userType === 'school'
                ? '/schoolindex.html'
                : userType === 'company'
                    ? '/companyindex.html'
                    : '/internindex.html';

            console.log(`User logged in as ${userType}, ID: ${user.id}, redirecting to ${redirectUrl}`);
            res.json({ redirect: redirectUrl });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});



// index.js (Logout Route)
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.redirect('/login.html');
    });
});



// Fetch current school profile
app.get('/api/school-profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    try {
        const result = await pool.query('SELECT * FROM school WHERE id = $1', [req.session.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Update school profile
app.put('/api/update-school-profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    const { name, contact, address, email, description } = req.body;

    try {
        console.log('Updating profile with data:', { name, contact, address, email, description });

        const result = await pool.query(
            'UPDATE school SET name = $1, contact = $2, address = $3, email = $4, description = $5 WHERE id = $6 RETURNING *',
            [name, contact, address, email, description, req.session.userId]
        );

        if (result.rowCount === 0) {
            console.log('Profile not found for update');
            return res.status(404).json({ error: 'Profile not found' });
        }

        console.log('Profile updated successfully:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Fetch current intern profile
app.get('/api/intern-profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    try {
        const result = await pool.query('SELECT * FROM intern WHERE id = $1', [req.session.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update intern profile
app.put('/api/update-intern-profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    // Destructure the data from the request body
    const { name, school_id, address, email, university, department } = req.body;

    try {
        console.log('Updating profile with data:', { name, school_id, address, email, university, department });

        // Execute the update query on the database
        const result = await pool.query(
            'UPDATE intern SET name = $1, school_id = $2, address = $3, email = $4, university = $5, department = $6 WHERE id = $7 RETURNING *',
            [name, school_id, address, email, university, department, req.session.userId]
        );

        if (result.rowCount === 0) {
            console.log('Profile not found for update');
            return res.status(404).json({ error: 'Profile not found' });
        }

        console.log('Profile updated successfully:', result.rows[0]);
        res.json(result.rows[0]); // Send the updated profile data as a response
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Fetch current company profile
app.get('/api/company-profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    try {
        const result = await pool.query('SELECT * FROM company WHERE id = $1', [req.session.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update company profile
app.put('/api/update-company-profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    // Destructure the data from the request body
    const { name, contact, address, email, role, department,description } = req.body;

    try {
        console.log('Updating profile with data:', { name, contact, address, email, role, department,description });

        // Execute the update query on the database
        const result = await pool.query(
            'UPDATE company SET name = $1, contact = $2, address = $3, email = $4, role = $5, department = $6, description = $7 WHERE id = $8 RETURNING *',
            [name, contact, address, email, role, department,description, req.session.userId]
        );

        if (result.rowCount === 0) {
            console.log('Profile not found for update');
            return res.status(404).json({ error: 'Profile not found' });
        }

        console.log('Profile updated successfully:', result.rows[0]);
        res.json(result.rows[0]); 
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// NEWS FEED
app.get('/api/posts', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                posts.*,
                school.name AS school_name,
                company.name AS company_name,
                COALESCE(school.email, company.email) AS user_email
            FROM posts
            LEFT JOIN school ON posts.school_id = school.id
            LEFT JOIN company ON posts.company_id = company.id
            ORDER BY created_at DESC
        `);
        res.json({ posts: result.rows, currentUserId: req.session.userId, userType: req.session.userType });
    } catch (err) {
        console.error('Error fetching posts:', err);
        res.status(500).send('Server error');
    }
});




app.post('/api/posts', upload.single('image'), authenticateUser, async (req, res) => {
    const { content } = req.body;
    const userId = req.session.userId; // The ID of the currently logged-in user
    const userType = req.session.userType; // 'school' or 'company'

    const image_url = req.file ? `uploads/${req.file.filename}` : null;

    try {
        let query, values;
        if (userType === 'school') {
            query = 'INSERT INTO posts (content, image_url, school_id) VALUES ($1, $2, $3) RETURNING *';
            values = [content, image_url, userId];
        } else if (userType === 'company') {
            query = 'INSERT INTO posts (content, image_url, company_id) VALUES ($1, $2, $3) RETURNING *';
            values = [content, image_url, userId];
        } else {
            return res.status(400).json({ error: 'Invalid user type' });
        }

        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error while posting:', err);
        res.status(500).send('Server error');
    }
});


// index.js
function authenticateUser(req, res, next) {
    if (!req.session.userId) {
        console.log('User not authenticated, no session ID found');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('User authenticated with session ID:', req.session.userId); // Debugging
    next();
}

// index.js (Delete Post Route)
app.delete('/api/posts/:id', authenticateUser, async (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;
    const userType = req.session.userType;

    try {
        // Restrict INTERN users
        if (userType === 'intern') {
            return res.status(403).json({ error: 'Interns are not allowed to delete posts.' });
        }

        // Existing logic: Check post ownership
        const postResult = await pool.query(
            'SELECT school_id, company_id FROM posts WHERE id = $1',
            [postId]
        );

        if (postResult.rows.length === 0) {
            return res.status(404).send('Post not found');
        }

        const post = postResult.rows[0];
        if ((userType === 'school' && post.school_id !== userId) ||
            (userType === 'company' && post.company_id !== userId)) {
            return res.status(403).send('You do not have permission to delete this post');
        }

        // Delete post
        await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
        res.sendStatus(204);
    } catch (err) {
        console.error('Error deleting post:', err);
        res.status(500).send('Server error');
    }
});


app.post('/api/company-posts', upload.single('image'), authenticateUser, async (req, res) => {
    const { content } = req.body;
    const companyId = req.session.userId; // Assuming `userId` holds the company ID

    const image_url = req.file ? `uploads/${req.file.filename}` : null;

    try {
        const result = await pool.query(
            'INSERT INTO posts (content, image_url, company_id) VALUES ($1, $2, $3) RETURNING *',
            [content, image_url, companyId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/api/company-posts', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT posts.*, company.name AS company_name, company.email AS company_email
            FROM posts
            JOIN company ON posts.company_id = company.id
            ORDER BY created_at DESC
        `);
        res.json({ posts: result.rows, currentUserId: req.session.userId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.delete('/api/company-posts/:id', authenticateUser, async (req, res) => {
    const postId = req.params.id;
    const companyId = req.session.userId;

    try {
        const postResult = await pool.query('SELECT company_id FROM posts WHERE id = $1', [postId]);
        if (postResult.rows.length === 0) return res.status(404).send('Post not found');
        if (postResult.rows[0].company_id !== companyId) return res.status(403).send('Unauthorized');

        await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
        res.sendStatus(204);
    } catch (err) {
        console.error('Error deleting post:', err);
        res.status(500).send('Server error');
    }
});

//INTERN VIEW PROFILE WITHOUT EDIT
app.get('/api/intern-profile/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const result = await pool.query('SELECT * FROM intern WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Intern not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching intern profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/company-profile/:email', async (req, res) => {
    let { email } = req.params;
    email = decodeURIComponent(email).toLowerCase();

    try {
        const result = await pool.query('SELECT * FROM company WHERE LOWER(email) = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        res.json(result.rows[0]); // Ensure the id is part of this response
    } catch (error) {
        console.error('Error fetching company profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});





// Fetch all tasks or filter by intern_id if provided
app.get('/api/tasks', async (req, res) => {
    const { intern_id } = req.query;
    const whereClause = intern_id ? { where: { intern_id } } : {};
    try {
      const tasks = await Task.findAll(whereClause);
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  
  // Create a new task with optional intern_id association
  app.post('/api/tasks', async (req, res) => {
    const { title, description, deadline, intern_id } = req.body; // Add intern_id
    try {
      const newTask = await Task.create({ title, description, deadline, intern_id }); // Include intern_id
      res.status(201).json(newTask);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
});

  
  // Update task details
  app.put('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, status, intern_id } = req.body;
    try {
      const task = await Task.findByPk(id);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      task.title = title;
      task.description = description;
      task.status = status;
      task.intern_id = intern_id; // Update the intern_id if provided
      await task.save();
      res.json(task);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  
  // Delete a task by ID
  app.delete('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const task = await Task.findByPk(id);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      await task.destroy();
      res.json({ message: 'Task deleted successfully' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  

  app.get('/api/company-infotech', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT name, email, address, contact, department, role 
            FROM company 
            WHERE is_approved = true AND department = 'Information Technology'
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching company users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/company/countinfotech', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) 
            FROM company 
            WHERE department = 'Information Technology' AND is_approved = true
        `);
        res.json({ total: result.rows[0].count });
    } catch (error) {
        console.error('Error fetching company count for Information Technology department:', error);
        res.status(500).send('Server Error');
    }
});


app.get('/api/company-industrytech', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT name, email, address, contact, department, role 
            FROM company 
            WHERE is_approved = true AND department = 'Industrial Technology'
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching company users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/company/countindustrytech', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) 
            FROM company 
            WHERE department = 'Industrial Technology' AND is_approved = true
        `);
        res.json({ total: result.rows[0].count });
    } catch (error) {
        console.error('Error fetching company count for Industrial Technology department:', error);
        res.status(500).send('Server Error');
    }
});


app.get('/api/company-computerengineer', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT name, email, address, contact, department, role 
            FROM company 
            WHERE is_approved = true AND department = 'Computer Engineering'
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching company users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/company/countcomputerengineer', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) 
            FROM company 
            WHERE department = 'Computer Engineer' AND is_approved = true
        `);
        res.json({ total: result.rows[0].count });
    } catch (error) {
        console.error('Error fetching company count for Industrial Technology department:', error);
        res.status(500).send('Server Error');
    }
});
app.post('/api/company/apply', async (req, res) => {
    const { company_id } = req.body;

    // Get intern ID and user type from the session
    const internId = req.session.userId;
    const userType = req.session.userType;

    // Authorization check to ensure only logged-in interns can apply
    if (!internId || userType !== 'intern') {
        console.error('Unauthorized application attempt:', { internId, userType });
        return res.status(401).json({ error: 'Unauthorized: Only logged-in interns can apply' });
    }

    try {
        // Insert the application into the database
        const result = await pool.query(
            `INSERT INTO companyinternshiprequests (company_id, intern_id, application_status, applied_at) 
             VALUES ($1, $2, 'Pending', CURRENT_TIMESTAMP)`,
            [company_id, internId]
        );

        console.log(`Intern ${internId} successfully applied to company ${company_id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error applying for internship:', error);
        if (error.code === '23505') { // PostgreSQL unique violation error code
            return res.status(400).json({ error: 'You have already applied for this internship.' });
        }

        res.status(500).json({ error: 'Failed to apply for internship' });
    }
});
// Server-side: Filter internship requests by the logged-in company's ID
app.get('/api/company-internship-requests', async (req, res) => {
    const companyId = req.session.userId; // Assume this is set when the company logs in

    if (!companyId || req.session.userType !== 'company') {
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    try {
        const result = await pool.query(
            `SELECT i.name AS intern_name, i.email AS intern_email, i.address AS intern_address, i.school_id, cir.id
             FROM companyinternshiprequests cir
             JOIN intern i ON cir.intern_id = i.id
             WHERE cir.company_id = $1 AND cir.application_status = 'Pending'`,
            [companyId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching internship requests for company:', error);
        res.status(500).json({ error: 'Failed to fetch internship requests' }); 
    }
});

// Endpoint to update internship request status
app.put('/api/company-internship-requests/:id', async (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    const { application_status } = req.body;

    try {
        await pool.query(
            `UPDATE companyinternshiprequests 
             SET application_status = $1, decision_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [application_status, requestId]
        );

        res.json({ message: `Request ${application_status.toLowerCase()} successfully.` });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});


// Endpoint to get approved interns for a company
app.get('/api/company-approved-interns/:companyId', async (req, res) => {
    const companyId = parseInt(req.params.companyId, 10);

    if (isNaN(companyId)) {
        return res.status(400).json({ error: 'Invalid company ID' });
    }

    try {
        const result = await pool.query(
            `SELECT i.name, i.email, i.address, i.university AS school_name 
             FROM companyinternshiprequests cir
             JOIN intern i ON cir.intern_id = i.id
             WHERE cir.company_id = $1 AND cir.application_status = 'Accepted'`,
            [companyId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching approved interns for company:', error);
        res.status(500).json({ error: 'Failed to fetch approved interns' });
    }
});



app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ message: 'Session is active', userId: req.session.userId, userType: req.session.userType });
    } else {
        res.status(401).json({ error: 'No active session' });
    }
});

app.post('/api/intern/upload-files', authenticateUser, (req, res) => {
    const internId = req.session.userId;

    if (!internId || req.session.userType !== 'intern') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    uploadMultiple(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: 'Multer error occurred when uploading.' });
        } else if (err) {
            return res.status(500).json({ error: 'An unknown error occurred when uploading.' });
        }

        try {
            const { company_id } = req.body;

            // Insert application data into companyinternshiprequests
            await pool.query(
                `INSERT INTO companyinternshiprequests (company_id, intern_id, application_status, applied_at)
                 VALUES ($1, $2, 'Pending', CURRENT_TIMESTAMP)`,
                [company_id, internId]
            );

            // Insert file data into uploaded_files
            const files = req.files.map((file) => ({
                file_name: file.filename,
                original_name: file.originalname,
                intern_id: internId,
                company_id,
            }));

            const query =
                'INSERT INTO uploaded_files (file_name, original_name, intern_id, company_id) VALUES ($1, $2, $3, $4)';

            for (const file of files) {
                await pool.query(query, [
                    file.file_name,
                    file.original_name,
                    file.intern_id,
                    file.company_id,
                ]);
            }

            res.json({ success: true, message: 'Application and files uploaded successfully!' });
        } catch (error) {
            console.error('Error processing application and file upload:', error);
            res.status(500).json({ error: 'Failed to process application and file upload.' });
        }
    });
});

app.get('/api/company-internship-status/:companyId', authenticateUser, async (req, res) => {
    const internId = req.session.userId;
    const { companyId } = req.params;

    if (!internId || req.session.userType !== 'intern') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await pool.query(
            `SELECT * FROM companyinternshiprequests WHERE intern_id = $1 AND company_id = $2`,
            [internId, companyId]
        );

        if (result.rows.length > 0) {
            res.json({ applied: true, applicationId: result.rows[0].id });
        } else {
            res.json({ applied: false });
        }
    } catch (error) {
        console.error('Error checking application status:', error);
        res.status(500).json({ error: 'Failed to check application status.' });
    }
});

app.delete('/api/intern/cancel-application/:applicationId', authenticateUser, async (req, res) => {
    const internId = req.session.userId;
    const { applicationId } = req.params;

    if (!internId || req.session.userType !== 'intern') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Fetch the application details to delete associated files
        const applicationResult = await pool.query(
            `SELECT * FROM companyinternshiprequests WHERE id = $1 AND intern_id = $2`,
            [applicationId, internId]
        );

        if (applicationResult.rowCount === 0) {
            return res.status(404).json({ error: 'Application not found or not authorized.' });
        }

        const { company_id } = applicationResult.rows[0];

        // Delete associated files from uploaded_files
        await pool.query(
            `DELETE FROM uploaded_files WHERE intern_id = $1 AND company_id = $2`,
            [internId, company_id]
        );

        // Delete the application from companyinternshiprequests
        await pool.query(
            `DELETE FROM companyinternshiprequests WHERE id = $1 AND intern_id = $2`,
            [applicationId, internId]
        );

        res.json({ success: true, message: 'Application and associated files deleted successfully.' });
    } catch (error) {
        console.error('Error cancelling application:', error);
        res.status(500).json({ error: 'Failed to cancel application.' });
    }
});

const PDFDocument = require('pdfkit');

app.get('/api/reports/pdf', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, email, address FROM school WHERE is_approved = true');
        const schools = result.rows;

        // Create a PDF document
        const doc = new PDFDocument();
        res.setHeader('Content-Disposition', 'attachment; filename="school-report.pdf"');
        res.setHeader('Content-Type', 'application/pdf');

        doc.pipe(res);
        doc.fontSize(18).text('Approved Schools Report', { align: 'center' });
        doc.moveDown();

        // Add school data
        schools.forEach((school, index) => {
            doc.fontSize(12).text(`${index + 1}. ${school.name}`);
            doc.text(`   Email: ${school.email}`);
            doc.text(`   Address: ${school.address}`);
            doc.moveDown();
        });

        doc.end();
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
});

const ExcelJS = require('exceljs');

app.get('/api/reports/excel', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, email, address FROM school WHERE is_approved = true');
        const schools = result.rows;

        // Create a new workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Approved Schools');

        // Define columns
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Address', key: 'address', width: 30 },
        ];

        // Add rows
        schools.forEach(school => worksheet.addRow(school));

        // Set headers for response
        res.setHeader('Content-Disposition', 'attachment; filename="school-report.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
