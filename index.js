const { exit } = require("process");
const inquirer = require("inquirer");
const fs = require("fs/promises");
const chalk = require("chalk");

const abort = (msg) => {
  console.log(chalk.red.bold(msg));
  exit();
};

// Function to generate live time
function getCurrentStandardTime() {
  const currentTime = new Date();
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();

  // Convert hours to 12-hour format
  const standardHours = hours % 12 || 12;

  // Determine whether it's AM or PM
  const period = hours < 12 ? "AM" : "PM";

  return `${standardHours}:${minutes}:${seconds} ${period}`;
}

// Path to store the API key
const CONFIG_FILE_PATH = "cricket-cli-config.json";

const getApiKey = async () => {
  let isValidApiKey = false;
  let apiKey;

  while (!isValidApiKey) {
    try {
      // Check if config file exists
      await fs.access(CONFIG_FILE_PATH);

      // If file exists, read config from file
      const configData = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
      const config = JSON.parse(configData); // Parse the JSON string
      apiKey = config.apiKey;
      isValidApiKey = true; // Set to true to exit the loop
    } catch (error) {
      // If file doesn't exist or apiKey is invalid, prompt user for API key
      const { apiKey: inputApiKey } = await inquirer.prompt({
        type: "input",
        name: "apiKey",
        message:
          "Enter your API key (Get your api key from - https://cricketdata.org):",
      });
      apiKey = inputApiKey.trim();

      // Check if the API key is valid
      const response = await fetch(
        `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
      );
      const data = await response.json();

      if (data.status === "failure" && data.reason === "Invalid API Key") {
        console.log(
          chalk.red.bold("Invalid API Key. Please enter a valid API Key.")
        );
      } else {
        // API key is valid, exit the loop
        isValidApiKey = true;
      }
    }
  }

  // Create config object
  const config = { apiKey };
  // Store config in a file
  await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
  return apiKey;
};

// Function to get live scores of the team user enters
const Scores = async (teamName) => {
  const apiKey = await getApiKey();
  const scores = await (
    await fetch(
      `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
    )
  ).json();

  if (!scores) {
    abort("No scores found, has the match started?");
  }

  // Filter scores based on user input team name
  const filteredScores = scores.data.filter((score) => {
    const teamNames = [
      score.teams[0].toLowerCase(),
      score.teams[1].toLowerCase(),
      score.teamInfo[0]?.shortname.toLowerCase(),
      score.teamInfo[1]?.shortname.toLowerCase(),
    ];
    return (
      score.name.includes(teamName.toLowerCase()) ||
      teamNames.includes(teamName.toLowerCase())
    );
  });

  return filteredScores;
};

// Function to fetch ongoing matches
const getOngoingMatches = async () => {
  const apiKey = await getApiKey();
  const matches = await (
    await fetch(
      `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
    )
  ).json();
  return matches.data.filter(
    (match) => !match.status.includes("not") && !match.status.includes("won")
  );
};

// Function to fetch upcoming matches
const getUpcomingMatches = async () => {
  const apiKey = await getApiKey();
  const matches = await (
    await fetch(`https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`)
  ).json();
  return matches.data.filter((match) =>
    match.status.includes("Match not started")
  );
};

// Function to fetch recent matches
const getRecentMatches = async () => {
  const apiKey = await getApiKey();
  const matches = await (
    await fetch(
      `https://api.cricapi.com/v1/currentMatches?apikey=${apiKey}&offset=0`
    )
  ).json();
  return matches.data.filter((match) => match.status.includes("won"));
};

// Function to display live scores
const displayScores = async () => {
  // Prompt user for team name
  const { teamName } = await inquirer.prompt({
    type: "input",
    name: "teamName",
    message: "Enter team name to filter matches:",
  });

  const scores = await Scores(teamName);

  if (scores.length === 0) {
    console.log(chalk.yellow.bold("No matches found for the specified team."));
    return;
  }

  const displayMatches = async () => {
    // Clear the terminal
    console.clear();

    scores.forEach((match) => {
      const headline = `\n${chalk.green.bold(
        "Last Update"
      )} - ${getCurrentStandardTime()}:`;
      const separator = chalk.gray.bold(
        Array(match.name.length + 20).join("-")
      );
      if (match.status.includes("won")) {
        console.log(chalk.yellow.bold("Match Has Been Ended"));
        console.log(` ${match.status}`);
        exit();
      }

      console.log(headline);
      console.log(separator);

      console.log(` ${chalk.green.bold(match.name)}`);
      console.log(
        ` ${chalk.blue.bold(match.teamInfo[0].shortname)} : ${chalk.yellow.bold(
          match.score[0]?.r || "0"
        )}/${chalk.yellow.bold(match.score[0]?.w || "0")}(${chalk.yellow.bold(
          match.score[0]?.o || "0"
        )})`
      );
      console.log(
        ` ${chalk.blue.bold(match.teamInfo[1].shortname)} : ${chalk.yellow.bold(
          match.score[1]?.r || "0"
        )}/${chalk.yellow.bold(match.score[1]?.w || "0")}(${chalk.yellow.bold(
          match.score[1]?.o || "0"
        )})`
      );

      console.log(` ${chalk.cyan.bold(match.status)}`);
      console.log(separator);
      if (match.status.includes("won")) {
        console.log(chalk.yellow.bold("Match Has Been Ended"));
        console.log(` ${match.status}`);
        clearInterval(interval);
        exit();
      }
    });
  };

  // Call the function immediately
  displayMatches();

  // Call the function every 1.5 minutes
  const interval = setInterval(displayMatches, 60000);
};

// Function to display ongoing matches
const displayOngoingMatches = async () => {
  let ongoingMatches = await getOngoingMatches();
  if (!ongoingMatches.length) {
    abort("No ongoing matches found.");
  }

  let currentIndex = 0;
  const pageSize = 3;

  while (currentIndex < ongoingMatches.length) {
    console.clear();
    console.log(chalk.yellow.bold("\n\nOngoing Matches:\n"));
    const matchesToShow = ongoingMatches.slice(
      currentIndex,
      currentIndex + pageSize
    );
    matchesToShow.forEach((match) => {
      const separator = chalk.gray.bold(
        Array(
          match.name.length > match.venue.length
            ? match.name.length
            : match.venue.length
        ).join("-")
      );
      console.log(` ${chalk.green.bold(match.name)}`);
      console.log(
        ` Date - ${chalk.cyan.bold(match.dateTimeGMT.split("T").join(" "))}`
      );
      console.log(` Venue - ${chalk.green.bold(match?.venue)}`);
      if (match.score[0]) {
        console.log(
          ` ${chalk.blue.bold(
            match.teamInfo[0].shortname
          )} : ${chalk.yellow.bold(match.score[0].r)}/${chalk.yellow.bold(
            match.score[0].w
          )}(${chalk.yellow.bold(match.score[0].o)})`
        );
      }
      if (match.score[1]) {
        console.log(
          ` ${chalk.blue.bold(
            match.teamInfo[1].shortname
          )} : ${chalk.yellow.bold(match.score[1].r)}/${chalk.yellow.bold(
            match.score[1].w
          )}(${chalk.yellow.bold(match.score[1].o)})`
        );
      }
      console.log(` ${chalk.cyan.bold(match.status)}`);
      console.log();
      console.log(separator);
      console.log();
    });

    const { nextPage } = await inquirer.prompt({
      type: "confirm",
      name: "nextPage",
      message: "Show next 3 matches?",
    });

    if (!nextPage) {
      break;
    }

    currentIndex += pageSize;
  }
};

// Function to display upcoming matches
const displayUpcomingMatches = async () => {
  let upcomingMatches = await getUpcomingMatches();
  if (!upcomingMatches.length) {
    abort("No upcoming matches found.");
  }

  let currentIndex = 0;
  const pageSize = 3;

  while (currentIndex < upcomingMatches.length) {
    console.clear();
    console.log(chalk.yellow.bold("\n\nUpcoming Matches:\n"));
    const matchesToShow = upcomingMatches.slice(
      currentIndex,
      currentIndex + pageSize
    );
    matchesToShow.forEach((match) => {
      const separator = chalk.gray.bold(
        Array(
          match.name.length > match.venue.length
            ? match.name.length
            : match.venue.length
        ).join("-")
      );
      console.log(` ${chalk.green.bold(match.name)}`);
      console.log(
        ` Date - ${chalk.cyan.bold(match.dateTimeGMT.split("T").join(" "))}`
      );
      console.log(` venue - ${chalk.green.bold(match?.venue)}`);
      console.log();
      console.log(separator);
      console.log();
    });

    const { nextPage } = await inquirer.prompt({
      type: "confirm",
      name: "nextPage",
      message: "Show next 3 matches?",
    });

    if (!nextPage) {
      break;
    }

    currentIndex += pageSize;
  }
};

// Function to display recent matches
const displayRecentMatches = async () => {
  let recentMatches = await getRecentMatches();
  if (!recentMatches.length) {
    abort("No recent matches found.");
  }

  let currentIndex = 0;
  const pageSize = 3;

  while (currentIndex < recentMatches.length) {
    console.clear();
    console.log(chalk.yellow.bold("\n\nRecent Matches:\n"));
    const matchesToShow = recentMatches.slice(
      currentIndex,
      currentIndex + pageSize
    );
    matchesToShow.forEach((match) => {
      const separator = chalk.gray.bold(Array(match.name.length).join("-"));
      console.log(` ${chalk.green.bold(match.name)}`);
      console.log(
        ` Date - ${chalk.cyan.bold(match.dateTimeGMT.split("T").join(" "))}`
      );
      console.log(
        ` ${chalk.blue.bold(match.teamInfo[0].shortname)} : ${chalk.yellow.bold(
          match.score[0].r
        )}/${chalk.yellow.bold(match.score[0].w)}(${chalk.yellow.bold(
          match.score[0].o
        )})`
      );
      console.log(
        ` ${chalk.blue.bold(match.teamInfo[1].shortname)} : ${chalk.yellow.bold(
          match.score[1].r
        )}/${chalk.yellow.bold(match.score[1].w)}(${chalk.yellow.bold(
          match.score[1].o
        )})`
      );
      console.log(` ${chalk.cyan.bold(match.status)}`);
      console.log();
      console.log(separator);
      console.log();
    });

    const { nextPage } = await inquirer.prompt({
      type: "confirm",
      name: "nextPage",
      message: "Show next 3 recent matches?",
    });

    if (!nextPage) {
      break;
    }

    currentIndex += pageSize;
  }
};

// Main function
const main = async () => {
  try {
    const { option } = await inquirer.prompt({
      type: "list",
      name: "option",
      message: chalk.bold(chalk.blue.bgWhite("Choose an option:")),
      choices: [
        "Live Scores",
        "Ongoing Matches",
        "Upcoming Matches",
        "Recent Matches",
      ],
    });

    switch (option) {
      case "Live Scores":
        await displayScores();
        break;
      case "Ongoing Matches":
        await displayOngoingMatches();
        break;
      case "Upcoming Matches":
        await displayUpcomingMatches();
        break;
      case "Recent Matches":
        await displayRecentMatches();
        break;
      default:
        abort(chalk.bold(chalk.red("Invalid option.")));
    }
  } catch (error) {
    console.error(chalk.bold(chalk.red("Error:")), error.message);
  }
};

module.exports = main;
