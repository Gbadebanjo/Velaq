-- One database per product. Tokens and credentials never span them.
CREATE DATABASE velaq_business;
CREATE DATABASE velaq_personal;
CREATE DATABASE velaq_marketplace;
-- Sign-in accounts and sessions for every product.
CREATE DATABASE velaq_identity;
