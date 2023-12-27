const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB();

const getTableName = (page) => {
  // Map query parameter to DynamoDB table name
  const validTables = { home: "home-page-insights-data", term: "term-page-insights-data", saving: "savings-page-insights-data" };
  return validTables[page] ? validTables[page] : "home-page-insights-data";
};

const getStartDate = (days) => {
  // Calculate start date based on days query parameter
  return days ? new Date().toISOString().split("T")[0] : getCurrentDate();
};

const getCurrentDate = () => {
  // Get current date in 'YYYY-MM-DD' format
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
};

const filterEntries = (items, days) => {
  // Filter entries based on days parameter
  if (days) {
    // Additional filtering logic for non-zero days
    const uniqueDays = new Set();
    const filteredItems = items.filter((entry) => {
      const day = entry.time.S.split("T")[0];
      const currentDay = new Date().toISOString().split("T")[0];
      const hourUtc = parseInt(entry.time.S.split("T")[1].split(":")[0], 10);
      const currentHourUtc = new Date().getUTCHours();

      if (currentHourUtc < 14 && day === currentDay && !uniqueDays.has(day)) {
        uniqueDays.add(day);
        return true;
      }

      if (hourUtc >= 14 && hourUtc < 16 && !uniqueDays.has(day)) {
        uniqueDays.add(day);
        return true;
      }

      return false;
    });

    const sortedItems = filteredItems.sort((a, b) => a.time.S.localeCompare(b.time.S)).reverse();
    return sortedItems.length > 0 ? sortedItems : [];
  } else {
    // Additional logic for days=0
    const currentDate = getCurrentDate();
    const afternoonEntries = items.filter((entry) => entry.time.S.startsWith(`${currentDate}T14`) || entry.time.S.startsWith(`${currentDate}T15`)).reverse();
    return afternoonEntries.length > 0 ? [afternoonEntries[0]] : [items[items.length - 1]];
  }
};

const camelize = (str) => {
  // Convert string to camelCase
  return str.replace(/[-_\s]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase()).split(" ")[0];
};

const simplifyObject = (originalObject) => {
  // Recursively simplify and camelCase keys of an object
  if (Array.isArray(originalObject)) return originalObject.map((item) => simplifyObject(item));
  else if (typeof originalObject === "object" && originalObject !== null) return Object.entries(originalObject).reduce((acc, [key, value]) => {
    const camelizedKey = camelize(key);
    if (camelizedKey !== "s" && camelizedKey !== "m") acc[camelizedKey] = typeof value === "object" ? simplifyObject(value) : value;
    else if (camelizedKey === "m" && typeof value === "object" && value !== null) Object.assign(acc, simplifyObject(value));
    else if (camelizedKey === "s" && typeof value === "string") acc = value;
    return acc;
  }, {});
  else return originalObject;
};

const simplifyAndCamelizeData = (data) => simplifyObject(data);

exports.handler = async (event, context) => {
  try {
    // Extract querystring parameters
    const { querystring } = event.params;
    if (!querystring || !querystring.page) return { error: "Page parameter is required." };

    const { page, days } = querystring;
    const tableName = getTableName(page);
    const startDate = getStartDate(days);
    const projectionExpression = "#datatimestamp, reportTime, desktop, mobile ";

    const params = {
      TableName: tableName,
      FilterExpression: "#datatimestamp >= :startDate",
      ProjectionExpression: projectionExpression,
      ExpressionAttributeNames: { "#datatimestamp": "time" },
      ExpressionAttributeValues: { ":startDate": { S: startDate } },
    };

    const data = await dynamoDB.scan(params).promise();
    const filteredData = filterEntries(data.Items, days);
    
    return simplifyAndCamelizeData(filteredData);
  } catch (error) {
    console.error("Error retrieving data from DynamoDB:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
};
