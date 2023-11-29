const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
		//await client.connect();

		const userCollection = client.db("FinalProject").collection("users");
		const productCollection = client
			.db("FinalProject")
			.collection("products");
		const reviewCollection = client
			.db("FinalProject")
			.collection("reviews");
		const couponCollection = client
			.db("FinalProject")
			.collection("coupons");
		const paymentCollection = client
			.db("FinalProject")
			.collection("payments");

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

		//add products
		app.post("/products", async (req, res) => {
			const product = req.body;
			const result = await productCollection.insertOne(product);
			res.send(result);
		});

		//product apis

		app.get("/products", async (req, res) => {
			const result = await productCollection.find().toArray();
			res.send(result);
		});
		app.get("/myProducts", async (req, res) => {
			const email = req.query.email;
			const query = { ownerEmail: email };
			const result = await productCollection.find(query).toArray();
			res.send(result);
		});

		//accepted products
		app.get("/api/acceptedProducts", async (req, res) => {
			const products = await productCollection.find().toArray();
			const sortbyAccepted = products.filter(
				(product) => product.status === "accepted"
			);
			const sortedProducts = sortbyAccepted.sort((a, b) => {
				return a.timestamp > b.timestamp ? -1 : 1;
			});
			res.send(sortedProducts);
		});

		//featured products
		app.get("/api/featuredProducts", async (req, res) => {
			const products = await productCollection
				.find({
					featured: "featured",
				}).toArray();
			// const sortbyFeatured = products.filter(
			// 	(product) => product.featured === "featured"
			// );
			// const sortedProducts = sortbyFeatured.sort((a, b) => {
			// 	return a.timestamp > b.timestamp ? -1 : 1;
			// });
			res.send(products);
		});

		//  search for products by tags
		app.get("/searchProducts/:search", async (req, res) => {
			try {
				const searchTerm = req.params.search;
				const page = parseInt(req.query.page) || 0;
				const size = parseInt(req.query.size) || 3;
				console.log("pagination query", page, size);
				// Check if searchTerm is a string
				if (typeof searchTerm !== "string") {
					console.error("Invalid search term:", searchTerm);
					res.status(400).send("Invalid search term");
					return;
				}

				console.log("Searching for " + searchTerm);

				const results = await productCollection
					.find({
						status: "accepted",
						tags: { $regex: searchTerm, $options: "i" },
					})
					.skip(page * size)
					.limit(size)
					.toArray();

				res.send(results);
			} catch (error) {
				console.error("Error searching for products:", error);
				res.status(500).send("Internal Server Error");
			}
		});

		app.get("/products/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await productCollection.findOne(query);
			res.send(result);
		});

		app.patch("/products/:id", async (req, res) => {
			const product = req.body;
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const updatedDoc = {
				$set: {
					ownerEmail: product.ownerEmail,
					product_name: product.product_name,
					description: product.description,
					image: product.image,
					tags: product.tags,
					facebook_external_link: product.facebook_external_link,
					google_external_link: product.google_external_link,
					status: "pending",
					timestamp: product.timestamp,
					featured: "pending",
					report: "pending",
				},
			};
			const result = await productCollection.updateOne(query, updatedDoc);
			res.send(result);
		});
		//accept or reject request
		app.patch("/api/status/:productId", async (req, res) => {
			const { status } = req.body;
			const productId = req.params.productId;

			if (!status) {
				return res.json({ message: "Please provide a valid status" });
			}
			let update = {
				$set: {
					status: status,
				},
			};

			const result = await productCollection.updateOne(
				{ _id: new ObjectId(productId) },
				update
			);
			res.send(result);
		});

		//make featured
		app.patch("/api/featured/:productId", async (req, res) => {
			const { featured } = req.body;
			const productId = req.params.productId;

			let update = {
				$set: {
					featured: featured,
				},
			};

			const result = await productCollection.updateOne(
				{ _id: new ObjectId(productId) },
				update
			);
			res.send(result);
		});

		//reported products
		app.get("/api/reportedProducts", verifyToken, async (req, res) => {
			const products = await productCollection.find().toArray();
			const sortbyReported = products.filter(
				(product) => product.report === "reported"
			);

			res.send(sortbyReported);
		});

		//delete reported products
		app.delete(
			"/api/reportedProduct/:productId",
			verifyToken,
			async (req, res) => {
				let productId = req.params.productId;
				const query = { _id: new ObjectId(productId) };
				const result = await productCollection.deleteOne(query);
				res.send(result);
			}
		);
         //make report 
		app.patch("/api/report/:productId", async (req, res) => {
			const { report } = req.body;
			const productId = req.params.productId;

			let update = {
				$set: {
					report: report,
				},
			};

			const result = await productCollection.updateOne(
				{ _id: new ObjectId(productId) },
				update
			);
			res.send(result);
		});
		// update vote count
		app.patch("/api/upvote/:productId", async (req, res) => {
			const { vote } = req.body;
			const productId = req.params.productId;

			let update = {
				$set: {
					vote: vote,
				},
			};

			const result = await productCollection.updateOne(
				{ _id: new ObjectId(productId) },
				update
			);
			res.send(result);
		});
        //delete product
		app.delete("/products/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await productCollection.deleteOne(query);
			res.send(result);
		});

		// reviews api

		// post reviews by productId
		app.post("/api/reviews", async (req, res) => {
			const newReview = req.body;
			const reviews = await reviewCollection.insertOne(newReview);
			res.send(reviews);
		});

		// get reviews by categoryId
		app.get("/api/reviews/:id", async (req, res) => {
			const productId = req.params.id;
			// Fetch reviews from the database where `categoryId` matches
			const query = { productId: productId };
			const cursor = reviewCollection.find(query);
			const reviews = await cursor.toArray();
			res.send(reviews);
		});

		//admin statistics
		app.get("/adminStatistic", verifyToken, async (req, res) => {
			const users = await userCollection.estimatedDocumentCount();
			const products = await productCollection.find().toArray();

			const acceptedProducts = products.filter(
				(product) => product.status === "accepted"
			);
			const product = acceptedProducts.length;
			const reviews = await reviewCollection.estimatedDocumentCount();
			res.send({ users, product, reviews });
		});

		// validate coupon
		app.post("/api/validate-coupon", verifyToken, async (req, res) => {
			const { couponCode } = req.body;
			const coupon = await couponCollection.findOne({
				coupon_code: couponCode,
			});
			if (coupon && new Date(coupon.expiry_date) > new Date()) {
				res.json({ isValid: true, discount: coupon.discount_amount });
			} else {
				res.json({ isValid: false });
			}
		});
        //get all coupons
		app.get('/coupons',verifyToken,async(req,res)=> {
            const result = await couponCollection.find().toArray();
			res.send(result);
		})

		  //delete coupon
		  app.delete("/coupons/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await couponCollection.deleteOne(query);
			res.send(result);
		});

		// payment intent
		app.post("/create-payment-intent", async (req, res) => {
			const { price } = req.body;
			const amount = parseInt(price * 100);
			console.log(amount, "amount inside the intent");

			const paymentIntent = await stripe.paymentIntents.create({
				amount: amount,
				currency: "usd",
				payment_method_types: ["card"],
			});

			res.send({
				clientSecret: paymentIntent.client_secret,
			});
		});

		// subscription checked
		app.get("/payments/:email", verifyToken, async (req, res) => {
			const email = req.params.email;

			if (email !== req.decoded.email) {
				return res.status(403).send({ message: "forbidden access" });
			}

			const query = { email: email };
			const user = await paymentCollection.findOne(query);
			let subscribed = false;
			if (user) {
				subscribed = user?.status === "subscribed";
			}
			res.send({ subscribed });
		});

		// payment for subscription
		app.post("/payments", async (req, res) => {
			const payment = req.body;
			const paymentResult = await paymentCollection.insertOne(payment);

			res.send(paymentResult);
		});

		// Send a ping to confirm a successful connection
		// await client.db("admin").command({ ping: 1 });
		// console.log(
		// 	"Pinged your deployment. You successfully connected to MongoDB!"
		// );
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
