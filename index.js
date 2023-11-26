const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oh6dvsr.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		await client.connect();

		const userCollection = client.db("FinalProject").collection("users");
		const productCollection = client
			.db("FinalProject")
			.collection("products");

		//jwt api
		app.post("/jwt", async (req, res) => {
			const user = req.body;
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: "1h",
			});
			res.send({ token });
		});

		//middlewares
		const verifyToken = (req, res, next) => {
			console.log(req.headers.authorization);
			if (!req.headers.authorization) {
				return res.status(401).send({ message: "forbidden access" });
			}
			const token = req.headers.authorization.split(" ")[1];
			jwt.verify(
				token,
				process.env.ACCESS_TOKEN_SECRET,
				(err, decoded) => {
					if (err) {
						return res
							.status(401)
							.send({ message: "forbidden access" });
					}

					req.decoded = decoded;
					next();
				}
			);
		};

		// users api

		app.get("/users", verifyToken, async (req, res) => {
			console.log(req.headers);
			const result = await userCollection.find().toArray();
			res.send(result);
		});

		//find admin email
		app.get("/users/admin/:email", verifyToken, async (req, res) => {
			const email = req.params.email;

			if (email !== req.decoded.email) {
				return res.status(403).send({ message: "forbidden access" });
			}

			const query = { email: email };
			const user = await userCollection.findOne(query);
			let admin = false;
			if (user) {
				admin = user?.role === "admin";
			}
			res.send({ admin });
		});
		//find moderator email
		app.get("/users/moderator/:email", verifyToken, async (req, res) => {
			const email = req.params.email;

			if (email !== req.decoded.email) {
				return res.status(403).send({ message: "forbidden access" });
			}

			const query = { email: email };
			const user = await userCollection.findOne(query);
			let moderator = false;
			if (user) {
				moderator = user?.role === "moderator";
			}
			res.send({ moderator });
		});

		app.post("/users", async (req, res) => {
			const user = req.body;
			// to check existing email
			const query = { email: user.email };
			const existingUser = await userCollection.findOne(query);
			if (existingUser) {
				return res.send({
					message: "User already exists",
					insertedId: null,
				});
			}
			const result = await userCollection.insertOne(user);
			res.send(result);
		});

		//make moderator
		app.patch("/users/moderator/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const updatedDoc = {
				$set: {
					role: "moderator",
				},
			};
			const result = await userCollection.updateOne(query, updatedDoc);
			res.send(result);
		});
		//make admin
		app.patch("/users/admin/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const updatedDoc = {
				$set: {
					role: "admin",
				},
			};
			const result = await userCollection.updateOne(query, updatedDoc);
			res.send(result);
		});

		//user delete by admin
		app.delete("/users/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await userCollection.deleteOne(query);
			res.send(result);
		});

		app.post("/products", async (req, res) => {
			const product = req.body;
			const result = await productCollection.insertOne(product);
			res.send(result);
		});

		app.get("/products", async (req, res) => {
			const email = req.query.email;
			const query = { ownerEmail: email };
			const result = await productCollection.find(query).toArray();
			res.send(result);
		});
		app.delete("/products/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await productCollection.deleteOne(query);
			res.send(result);
		});

		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log(
			"Pinged your deployment. You successfully connected to MongoDB!"
		);
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("Final Effort is running!");
});

app.listen(port, () => {
	console.log(`Final app listening on port ${port}`);
});
