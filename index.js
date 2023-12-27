const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB();

const getTableName = (page) => {
  const validTables = {
    home: "home-page-insights-data",
    term: "term-page-insights-data",
    saving: "savings-page-insights-data",
  };

  return validTables[page] ? validTables[page] : "home-page-insights-data";
};

const getStartDate = (days) => {
  if (days) {
    const now = new Date();
    now.setDate(now.getDate() - days);
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  } else {
    return getCurrentDate();
  }
};

const getCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const filterEntries = (items, days) => {
  if (days) {
    const uniqueDays = new Set();
    const filteredItems = items.filter((entry) => {
      const day = entry.reportTime.S.split(" ")[2];
      const currentDay = new Date().getDate().toString().padStart(2, "0");
      const hourUtc = parseInt(entry.reportTime.S.split(" ")[4], 10);
      const currentHourUtc = new Date().getUTCHours();

      // Include latest entry from today if the current time is before 2 PM UTC
      if (currentHourUtc < 14 && day === currentDay) {
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

    return filteredItems.length > 0 ? filteredItems : [items[items.length - 1]];
  } else {
    // Your existing logic for days=0
    const currentDate = getCurrentDate();
    const afternoonEntries = items
      .filter(
        (entry) =>
          entry.reportTime.S.startsWith(`${currentDate}T14`) ||
          entry.reportTime.S.startsWith(`${currentDate}T15`)
      )
      .reverse();

    return afternoonEntries.length > 0
      ? [afternoonEntries[0]]
      : [items[items.length - 1]];
  }
};

const camelize = (str) => str.replace(/[-_\s](.)/g, (_, c) => c.toUpperCase());

const simplifyObject = (originalObject) => {
  return Object.entries(originalObject).reduce((acc, [key, value]) => {
    acc[camelize(key)] =
      typeof value === "object"
        ? simplifyObject(value)
        : value.S || value.N || value;
    return acc;
  }, {});
};

const simplifyAndCamelizeData = (data) => {
  return data.map((item) => {
    return {
      reportTime: item.reportTime,
      desktop: simplifyObject(item.desktop.M),
      mobile: simplifyObject(item.mobile.M),
    };
  });
};

exports.handler = async (event, context) => {
  try {
    const { querystring } = event.params;
    if (!querystring || !querystring.page) {
      console.error("Error: Page parameter is required.");
      return { error: "Page parameter is required." };
    }
    const { page, days } = querystring;
    const tableName = getTableName(page);
    const startDate = getStartDate(days);
    const projectionExpression = "#datatimestamp, reportTime, desktop, mobile ";

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

    const data = await dynamoDB.scan(params).promise();
    const filteredData = filterEntries(data.Items, days);
    console.log("Data from DynamoDB:", JSON.stringify(filteredData, null, 2));

    return simplifyAndCamelizeData(filteredData);
  } catch (error) {
    console.error("Error retrieving data from DynamoDB:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
