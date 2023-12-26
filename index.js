const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB();

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
    const projectionExpression =
      "#datatimestamp, reportTime, desktop.Accessibility, desktop.BestPractices, desktop.CumulativeLayoutShift, desktop.FirstContentfulPaint, desktop.LargestContentfulPaint, desktop.Performance, desktop.SEO, desktop.SpeedIndex, desktop.TotalBlockingTime, mobile.Accessibility, mobile.BestPractices, mobile.CumulativeLayoutShift, mobile.FirstContentfulPaint, mobile.LargestContentfulPaint, mobile.Performance, mobile.SEO, mobile.SpeedIndex, mobile.TotalBlockingTime";

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
    return {
      statusCode: 200,
      body: JSON.stringify(filteredData),
    };
  } catch (error) {
    console.error("Error retrieving data from DynamoDB:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
const getTableName = (page) => {
  const validTables = [
    "home-page-insights-data",
    "term-page-insights-data",
    "savings-page-insights-data",
  ];
  return validTables.includes(page) ? page : "home-page-insights-data";
};
const getStartDate = (days) => {
  if (days) {
    const now = new Date();
    now.setDate(now.getDate() - days); // Subtract the requested number of days
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  } else {
    // If days is not provided, return the current date
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
      // If days is provided, select only one entry from each day in the afternoon
      const uniqueDays = new Set();
      const filteredItems = items.filter((entry) => {
        const day = entry.time.S.split("T")[0];
        const hour = parseInt(entry.time.S.split("T")[1].split(":")[0], 10);
        if (hour >= 14 && hour < 16 && !uniqueDays.has(day)) {
          uniqueDays.add(day);
          return true;
        }
        return false;
      });
  
      // If there are no entries for the afternoon, return the last entry
      return filteredItems.length > 0 ? filteredItems : [items[items.length - 1]];
    } else {
      // If days is not provided, select the last entry from the afternoon
      const currentDate = getCurrentDate();
      const afternoonEntries = items
        .filter(
          (entry) =>
            entry.time.S.startsWith(`${currentDate}T14`) ||
            entry.time.S.startsWith(`${currentDate}T15`)
        )
        .reverse(); // Reverse the array to get the last entry first
  
      // If there are no entries for the afternoon, return the last entry
      return afternoonEntries.length > 0 ? [afternoonEntries[0]] : [items[items.length - 1]];
    }
  };
  