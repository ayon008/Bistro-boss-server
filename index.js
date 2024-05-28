require('dotenv').config();
const bodyParser = require('body-parser');
const axios = require('axios');
const stripe = require('stripe')('sk_test_51PBVoLRpKZBTemtI25rA4u0oKiW9Uz2kaZWqZGhQCRjP2bqzdZpa7neCPUBKDQxz46zY3LXMy1YDAVTrEx1RsZHc00GMFIQ37w');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.vgoyzza.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
    origin: 'http://localhost:5173/', // Allow requests from a specific origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], // Allow only specific HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow only specific headers
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static("public"));

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Routes
app.get('/', (req, res) => {
    res.send('Server is running');
});


// sk_test_51PBVoLRpKZBTemtI25rA4u0oKiW9Uz2kaZWqZGhQCRjP2bqzdZpa7neCPUBKDQxz46zY3LXMy1YDAVTrEx1RsZHc00GMFIQ37w


// JWT Verification Middleware
const verifyToken = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'Invalid authorization' });
    }
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
            return res.status(401).send({ message: 'Authorization Failed' });
        }
        req.decoded = decoded;
        next();
    });
};

async function run() {
    try {
        const database = client.db('BistroBoss');
        const menuCollection = database.collection('menu');
        const reviewCollection = database.collection('reviews');
        const mailBox = database.collection('contact');
        const usersCollection = database.collection('users');
        const ordersCollection = database.collection('orders');
        const bookingsCollection = database.collection('bookings');
        const paymentCollection = database.collection('payment');

        app.post('/userToken', async (req, res) => {
            const { email } = req.body;
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
            res.send({ token });
        });

        const verifyAdmin = async (req, res, next) => {
            const adminEmail = req.decoded.email;
            const query = { email: { $eq: adminEmail } }
            const findAdmin = await usersCollection.findOne(query);
            if (findAdmin.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'unauthorized access' })
            }
            next();
        }

        app.get('/user/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.status(401).send({ message: 'Invalid token' });
            }
            const query = { email };
            const find = await usersCollection.findOne(query);
            res.send({ admin: find?.role === 'admin' });
        });

        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        });

        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            const find = await menuCollection.findOne(query);
            res.send(find);
        })

        app.get('/menu:category', async (req, res) => {
            const category = req.params.category;
            const limit = parseInt(req.query.limit);
            const query = { category: { $eq: category } };
            const result = await menuCollection.find(query).limit(limit).toArray();
            res.send(result);
        });

        app.get('/menu/length/:category', async (req, res) => {
            const category = req.params.category;
            const query = { category: { $eq: category } };
            const items = await menuCollection.countDocuments(query);
            res.send({ items });
        });

        // Orders Endpoints
        app.get('/orders', verifyToken, async (req, res) => {
            const email = req.query.email;
            if (req.decoded.email !== email) {
                return res.status(401).send({ message: 'Invalid authorization' });
            }
            const query = { email };
            const result = await ordersCollection.find(query).toArray();
            res.send(result);
        });

        // Bookings Endpoints
        app.get('/bookings', verifyToken, async (req, res) => {
            const email = req.query.email;
            if (req.decoded.email !== email) {
                return res.status(401).send({ message: 'Invalid authorization' });
            }
            const query = { email: { $eq: email } };
            const result = await bookingsCollection.find(query).toArray();
            console.log(result);
            res.send(result);
        });

        // User Endpoints


        app.post('/contactus', async (req, res) => {
            const { name, email, phone, message, captchaToken } = req.body;
            if (!captchaToken) {
                return res.status(400).send({ message: 'reCAPTCHA token is missing' });
            }

            const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${captchaToken}`;
            try {
                console.log('clicked');
                const response = await axios.post(verificationUrl);
                const data = response.data;
                console.log(data);
                if (data.success) {
                    const result = await mailBox.insertOne({ name, email, phone, message });
                    console.log('clicked');
                    return res.send({ message: 'reCAPTCHA verified successfully', result });
                } else {
                    return res.status(400).send({ message: 'reCAPTCHA verification failed', errors: data['error-codes'] });
                }
            } catch (error) {
                return res.status(500).send({ message: 'Error verifying reCAPTCHA', error: error.message });
            }
        });

        app.post('/user', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const findOne = await usersCollection.findOne(query);
            if (!findOne) {
                const result = await usersCollection.insertOne(user);
                return res.send(result);
            }
            res.status(400).send({ message: 'User already exists' });
        });

        app.post('/orders', verifyToken, async (req, res) => {
            const email = req.decoded.email;
            const data = req.body;
            if (data.email !== email) {
                return res.status(401).send({ message: 'Invalid authorization' });
            }
            const result = await ordersCollection.insertOne(data);
            res.send(result);
        });

        app.post('/bookings', verifyToken, async (req, res) => {
            const email = req.decoded.email;
            const data = req.body;
            if (data.userEmail !== email) {
                return res.status(401).send({ message: 'Invalid authorization' });
            }
            const result = await bookingsCollection.insertOne(data);
            res.send(result);
        });

        app.post('/reviews', verifyToken, async (req, res) => {
            const email = req.decoded.email;
            const data = req.body;
            if (data.userEmail !== email) {
                return res.status(401).send({ message: 'Invalid authorization' });
            }
            const result = await reviewCollection.insertOne(data);
            res.send(result);
        });


        app.delete('/order/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await ordersCollection.deleteOne(query);
            res.send(result);
        });

        app.delete('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bookingsCollection.deleteOne(query);
            res.send(result);
        });

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            console.log('clicked');
            const id = req.params.id;
            const query = { _id: id }
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            console.log('clicked');
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: id }
            const updatedDoc = {
                $set: {
                    name: item.recipeName,
                    category: item.category,
                    price: item.price,
                    recipe: item.details,
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const data = req.body;
            const result = await menuCollection.insertOne(data)
            res.send(result);
        })

        app.get('/user', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            console.log('clicked');
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/allBookings', verifyToken, verifyAdmin, async (req, res) => {
            const result = await bookingsCollection.find().toArray()
            res.send(result);
        })


        app.post("/create-payment-intent", verifyToken, async (req, res) => {
            const { price } = req.body;
            console.log(price);
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: price * 100,
                currency: "usd",
                // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
                payment_method_types: [
                    'card',
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', verifyToken, async (req, res) => {
            const data = req.body;
            const query = { _id: { $in: data?.cartIds.map(id => new ObjectId(id)) } }
            const insertedData = await paymentCollection.insertOne(data);
            const result = await ordersCollection.deleteMany(query);
            res.send(insertedData);
        })

        app.get('/payments', verifyToken, async (req, res) => {
            const email = req.query.email;
            console.log(email);
            const query = { email: { $eq: email } };
            const find = await paymentCollection.find(query).toArray();
            res.send(find)
        })

        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue
            })
        })

        app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuItemIds'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$menuItems.price' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }
            ]).toArray();

            res.send(result);

        })

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server is running on the port ${port}`);
});
