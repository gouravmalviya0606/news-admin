const express = require('express')
const bodyParser = require('body-parser')
const mysql = require('mysql')
const cors = require('cors'); // Import the cors middleware
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
var fileupload = require('express-fileupload');


const app = express()
const port = process.env.PORT || 5000;
const jwtSecret = 'NEWS'; // Replace with your own secret




app.use(fileupload()); 
app.use(express.json({limit: '50mb'}));
// Use the cors middleware
app.use(cors());
// Parsing middleware
// Parse application/x-www-form-urlencoded
// app.use(bodyParser.urlencoded({ extended: false })); // Remove 
// app.use(express.urlencoded({extended: true})); // New
app.use(bodyParser.urlencoded({ extended: true }))
// Parse application/json
// app.use(bodyParser.json()); // Remove
// app.use(express.json()); // New
app.use(bodyParser.json())

// MySQL Code goes here

// Listen on enviroment port or 5000
app.listen(port, () => console.log(`Listening on port ${port}`))
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

const pool  = mysql.createPool({
    connectionLimit : 10,
    host            : 'localhost',
    user            : 'root',
    password        : '',
    database        : 'news'
})


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './public/assets/'); // Save files to public/assets
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); // Add a timestamp to the filename
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1000000 }, // 1MB file size limit
}).single('file');

// Get all beers
app.get('', (req, res) => {

    const { token } = req.body;
    pool.getConnection((err, connection) => {
        if (err) {
            connection.release();
            return res.status(500).send(err);
        }
        const sql = `
            SELECT news.*,files.unique_name,user.name as editor_name
            FROM news 
            INNER JOIN user ON news.editor_id = user.id 
            LEFT JOIN files ON news.file_id = files.id
        `;
        connection.query(sql, [token], (err, result) => {
            connection.release();
            if (err) {
                return res.status(500).send(err);
            }
            result.forEach(element => {
                element['unique_name'] = `http://localhost:${port}/assets/${element['unique_name']}`;
            });
            res.send({ data: result, status: 200 });
        });
    });
})

app.post('/login', (req, res) => {
    const { email, password } = req.body.data;
    pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.query('SELECT * FROM user WHERE email = ? AND password = ? AND role = ?', [email,password,'EDITOR'], (err, rows) => {
            if (err) {
                connection.release();
                return res.status(500).send({login:false});
            }
            
            if (rows.length === 0) {
                connection.release();
                return res.status(400).send({'msg':'User not found',login:false});
            }

            const user = rows[0];
            const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '1h' });

            connection.query('UPDATE user SET token = ? WHERE id = ?', [token, user.id], (err, result) => {
                connection.release();
                if (err) {
                    return res.status(500).send(err);
                }

                // res.status(200).send({ token });
                res.status(200).send({ token,'status':200,'login':true });
            });
            
        });
    });
});

app.post('/getAdminNews', (req, res) => {
    const { token } = req.body;
    pool.getConnection((err, connection) => {
        if (err) {
            connection.release();
            return res.status(500).send(err);
        }
        const sql = `
            SELECT news.*,files.unique_name,user.name as editor_name
            FROM news 
            INNER JOIN user ON news.editor_id = user.id 
            LEFT JOIN files ON news.file_id = files.id
            WHERE user.token = ?
        `;
        connection.query(sql, [token], (err, result) => {
            connection.release();
            if (err) {
                return res.status(500).send(err);
            }
            result.forEach(element => {
                element['unique_name'] = `http://localhost:${port}/assets/${element['unique_name']}`;
            });
            res.send({ data: result, status: 200 });
        });
    });
});

app.get('/getDetailsForAddNews', (req, res) => {
    pool.getConnection((err, connection) => {
        if(err) throw err
        connection.query('SELECT id,name from user WHERE role = ?',['editor'] ,(err, rows) => {
            connection.release() 
            if (!err) {
                res.send({'editors':rows,'status':200})
            } else {
                res.send({'status':500})
            }
            console.log('The data from beer table are: \n', rows)
        })
    })
})


app.post('/addNewNews',(req,res) =>{

    let file = req.files.file;
    console.log(path.join(__dirname, 'public/assets/') );
    req.files.file.mv(path.join(__dirname, `public/assets/${file['name']}`), function (err, res) {
        if (err) { console.log(err) }
    });
    pool.getConnection((err, connection) => {
        if(err) throw err
        const params = JSON.parse(req.body.details);
        console.log(params);
        connection.query('SELECT * from user WHERE token = ?',[params['token']],(err,user)=>{
            console.log(user[0]['id']);
            console.log(params);
            connection.query('INSERT INTO news (title,category,file_id,editor_id,discription) VALUES (?,?,?,?,?)',[params['title'],params['category'],1,user[0]['id'],params['discription']] ,(err, rows) => {
                if (!err) {
                   console.log(rows);
                    connection.query('INSERT INTO files (name,type,unique_name) VALUES (?,?,?)',[file['name'],'IMAGE',file['name']],(err, result) => {
                        connection.query('UPDATE news SET file_id = ? WHERE id = ?',[result.insertId,rows.insertId],(er,r)=>{
                            res.send({'msg':'news added successfully','status':200})
                        })
                    })
                } else {
                    res.send({err,'status':500})
                }
            })
        })
    })
})


