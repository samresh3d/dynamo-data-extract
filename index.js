// Import AWS SDK for DynamoDB
const AWS = require("aws-sdk");

// Create a DynamoDB instance
const dynamoDB = new AWS.DynamoDB();

// Helper function to determine the DynamoDB table name based on the page parameter
const getTableName = (page) => {
  const validTables = {
    home: "home-page-insights-data",
    term: "term-page-insights-data",
    saving: "savings-page-insights-data",
  };

  return validTables[page] ? validTables[page] : "home-page-insights-data";
};

// Helper function to get the start date based on the number of days
const getStartDate = (days) => {
  if (days) {
    // If days is provided, calculate the start date by subtracting days from the current date
    // Format the date in 'YYYY-MM-DD' format
    const now = new Date();
    now.setDate(now.getDate() - days);
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  } else {
    // If days is not provided, use the current date
    return getCurrentDate();
  }
};

// Helper function to get the current date in 'YYYY-MM-DD' format
const getCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper function to filter entries based on the provided days parameter
const filterEntries = (items, days) => {
  if (days) {
    // If days is provided, filter entries based on specific criteria
    const uniqueDays = new Set();

    const filteredItems = items.filter((entry) => {
      const day = entry.time.S.split("T")[0]; // Extract the day from the timestamp
      const currentDay = new Date().toISOString().split("T")[0];
      const hourUtc = parseInt(entry.time.S.split("T")[1].split(":")[0], 10);
      const currentHourUtc = new Date().getUTCHours();

      // Include entries from today if the current time is before 2 PM UTC
      if (currentHourUtc < 14 && day === currentDay && !uniqueDays.has(day)) {
        uniqueDays.add(day);
        return true;
      }

      // Include entries from afternoon 2 PM to 4 PM UTC yesterday and earlier
      if (hourUtc >= 14 && hourUtc < 16 && !uniqueDays.has(day)) {
        uniqueDays.add(day);
        return true;
      }

      return false;
    });

    // Sort the filtered items by timestamp in descending order
    const sortedItems = filteredItems
      .sort((a, b) => a.time.S.localeCompare(b.time.S))
      .reverse();

    return sortedItems.length > 0 ? sortedItems : [];
  } else {
    // If days is not provided, apply different logic for days=0
    const currentDate = getCurrentDate();
    const afternoonEntries = items
      .filter(
        (entry) =>
          entry.time.S.startsWith(`${currentDate}T14`) ||
          entry.time.S.startsWith(`${currentDate}T15`)
      )
      .reverse();

    return afternoonEntries.length > 0
      ? [afternoonEntries[0]]
      : [items[items.length - 1]];
  }
};

// Helper function to convert a string to camel case
const camelize = (str) => {
  const camelCaseString = str
    .replace(/[-_\s]+(\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toLowerCase());

  return camelCaseString.split(" ")[0];
};

// Helper function to simplify and camel case the keys of an object
const simplifyObject = (originalObject) => {
  if (Array.isArray(originalObject)) {
    // If the original object is an array, apply simplification recursively to each item
    return originalObject.map((item) => simplifyObject(item));
  } else if (typeof originalObject === "object" && originalObject !== null) {
    // If the original object is an object, apply simplification to each key-value pair
    return Object.entries(originalObject).reduce((acc, [key, value]) => {
      const camelizedKey = camelize(key);
      if (camelizedKey !== "s" && camelizedKey !== "m") {
        acc[camelizedKey] =
          typeof value === "object" ? simplifyObject(value) : value;
      } else if (
        camelizedKey === "m" &&
        typeof value === "object" &&
        value !== null
      ) {
        // Include the values under "M" directly in the parent object
        Object.assign(acc, simplifyObject(value));
      } else if (camelizedKey === "s" && typeof value === "string") {
        // Include the value under "S" directly in the parent object
        acc = value;
      }
      return acc;
    }, {});
  } else {
    // If the original object is neither an array nor an object, return it as is
    return originalObject;
  }
};

// Helper function to simplify and camel case the keys of the data object
const simplifyAndCamelizeData = (data) => simplifyObject(data);

// AWS Lambda handler function
exports.handler = async (event, context) => {
  try {
    // Extract querystring parameters from the event
    const { querystring } = event.params;
    if (!querystring || !querystring.page) {
      // If page parameter is missing, log an error and return an error response
      console.error("Error: Page parameter is required.");
      return { error: "Page parameter is required." };
    }
    const { page, days } = querystring;

    // Determine the DynamoDB table name, start date, and projection expression
    const tableName = getTableName(page);
    const startDate = getStartDate(days);
    const projectionExpression = "#datatimestamp, reportTime, desktop, mobile ";

    // Set up DynamoDB scan parameters
    const params = {
      TableName: tableName,
      FilterExpression: "#datatimestamp >= :startDate",
      ProjectionExpression: projectionExpression,
      ExpressionAttributeNames: {
        "#datatimestamp": "time",
      },
      ExpressionAttributeValues: {
        ":startDate": { S: startDate },
      },
    };

    // Perform DynamoDB scan and get the data
    const data = await dynamoDB.scan(params).promise();

    // Filter and simplify the data
    const filteredData = filterEntries(data.Items, days);

    // Return the simplified and camel cased data
    return simplifyAndCamelizeData(filteredData);
  } catch (error) {
    // Log an error if there's an exception and return an error response
    console.error("Error retrieving data from DynamoDB:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
