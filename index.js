import puppeteer from 'puppeteer';
import {input, select} from '@inquirer/prompts';
import fs from 'fs';
import {format, subWeeks} from "date-fns";

let startDate = null;
let endDate = null;
let monthName = null;
const chartTypes = ["Dora", "Delivery", "Quality", "Throughput"];


const screenshotMetricsCharts = async () => {
    let cookies = null;

    console.log('Checking your authentication status...');

    const loginBrowser = await puppeteer.launch({headless: 'new'});
    const page = await loginBrowser.newPage();

    const savedCookies = await getSavedCookies();
    if (savedCookies) {
        await page.setCookie(...savedCookies);
        cookies = savedCookies;
    }

    await page.goto('https://app.linearb.io/', {waitUntil: 'networkidle0', timeout: 0});

    if (page.url().includes("register") || page.url().includes('login')) {
        console.log('Please login into your LinearB account to continue...');

        const promptLoginBrowser = await puppeteer.launch({headless: false});
        const [promptPage] = await promptLoginBrowser.pages();
        await promptPage.goto('https://app.linearb.io/login', {waitUntil: 'networkidle0', timeout: 0});
        await promptPage.waitForSelector('#messageCenter', {timeout: 90000});

        console.log('You are now logged in. Please wait while we generate your charts...');

        cookies = await promptPage.cookies();

        const cookiesPath = './cookies';
        if (!fs.existsSync(cookiesPath)) fs.mkdirSync(cookiesPath, {recursive: true});
        await saveCookies(cookies);

        await promptLoginBrowser.close();
    }


    console.log('Launching LinearB charts...')

    await Promise.all(chartTypes.map(async (chartType) => {
        const browser = await puppeteer.launch({headless: 'new'});
        const page = await browser.newPage();

        await page.setCookie(...cookies);
        await page.setViewport({width: 1920, height: 1080});

        await page.goto(
            `https://app.linearb.io/performance/${chartType}?globallySelectedTeams=all-teams&filterType=People&selectedGranularity=auto&selectedContributor=416942808&selectedTimeRanges=${startDate}%2C${endDate}`,
            {waitUntil: 'load', timeout: 0}
        );

        const chartsContainerElem = await page.waitForXPath('/html/body/div[1]/div/div[2]/div/div/div[2]');
        await page.waitForTimeout(4000);

        const startDateObj = new Date(startDate);
        const year = startDateObj.getFullYear();

        // creates period folder if it does not exist
        const dirPath = `./screenshots/${year}/${monthName}/${startDate}__${endDate}`;
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, {recursive: true});

        await chartsContainerElem.screenshot({path: `${dirPath}/${chartType}.png`});

        console.log(`${chartType} chart screenshot taken`);

        await browser.close();
    }));

    console.log('Done, check your screenshots folder');
}

const getSavedCookies = async () => {
    if (!fs.existsSync('./cookies/cookies.json')) return false;

    const cookiesJSON = fs.readFileSync('./cookies/cookies.json');
    if (!cookiesJSON) return false;

    return JSON.parse(cookiesJSON);
}

const saveCookies = async (cookies) => {
    fs.writeFileSync('./cookies/cookies.json', JSON.stringify(cookies));
}

(async () => {
    let todayDate = new Date();
    todayDate.setUTCHours(12, 0, 0, 0);
    let past2weeksDate = subWeeks(todayDate, 2);
    todayDate = format(todayDate, "yyyy-MM-dd");
    past2weeksDate = format(past2weeksDate, "yyyy-MM-dd");

    console.log(todayDate, past2weeksDate);

    const dateType = await select({
        message: 'Select a date to generate your charts:',
        choices: [
            {
                'name': `Last 2 weeks (${past2weeksDate} - ${todayDate})`,
                'value': '2-week'
            },
            {
                'name': `Custom date range`,
                'value': 'custom'
            },
        ]
    });

    if (dateType === "2-week") {
        startDate = past2weeksDate;
        endDate = todayDate;
    } else {
        startDate = await input({message: 'Whats the start date? (YYYY-MM-DD)'});
        endDate = await input({message: 'Whats the end date? (YYYY-MM-DD)'});
    }

    const startDateObj = new Date(startDate);
    startDateObj.setUTCHours(12, 0, 0, 0);
    monthName = format(startDateObj, 'LLLL');

    await screenshotMetricsCharts();

    process.exit();
})();