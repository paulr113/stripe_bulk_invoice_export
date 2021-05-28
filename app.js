const Downloader = require('nodejs-file-downloader');
const cliProgress = require('cli-progress');

let stripe;
let threadCount = 1;

function getAllUrls() {
    return new Promise(async (resolve, reject) => {
        const bar = new cliProgress.SingleBar({
            format: 'Fetching urls: {value}',
            hideCursor: true
        });
        bar.start()
        let arr = []
        while (true) {
            let res = await getBatch(arr.length > 0 ? arr[arr.length - 1] : null).catch((err) => {
                return reject(err);
            });
            arr = arr.concat(res.arr);
            bar.update(arr.length);
            if (!res.has_more) {
                break;
            }
        }

        arr = arr.map((i) => {
            return i.invoice_pdf;
        }).filter((i) => i != null)

        bar.update(arr.length)
        bar.stop()
        return resolve(arr)
    });
}

function getBatch(lastObject) {
    return new Promise((resolve, reject) => {
        let options = {
            limit: 100
        }
        if (lastObject != null) {
            options.starting_after = lastObject.id
        }
        stripe.invoices.list(options).then((res) => {
            return resolve({ has_more: res.has_more, arr: res.data })
        }).catch((err) => {
            return reject(err);
        })
    });
}

function downloadUrls(arr) {
    return new Promise((resolve, reject) => {
        const bar = new cliProgress.SingleBar({
            format: 'Downloading pdfs: [' + '{bar}' + '] {percentage}% ({value}/{total} Files)',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });
        bar.start(arr.length, 0);
        let interval = setInterval(() => {
            bar.update(arr.length - queue.length() - queue.running())
        }, 15)

        const async = require('async')
        const queue = async.queue(downloadFile, threadCount);
        queue.drain(() => {
            clearInterval(interval);
            bar.update(arr.length)
            bar.stop()
            return resolve()
        })
        queue.error((err, url) => {
            console.log(`\nError downloading  ${url} retrying...`)
            queue.push(url);
        })

        arr.forEach(url => {
            queue.push(url)
        });
    });
}

function downloadFile(url, cb) {
    const downloader = new Downloader({
        url: url,
        directory: "./downloads"
    })
    downloader.download().then(() => {
        cb();
    }).catch((err) => {
        cb(err);
    })
}

function getInput(question, int = false) {
    return new Promise((resolve, reject) => {
        const prompt = require('prompt');
        prompt.message = ""
        prompt.colors = true
        prompt.start()
        prompt.getInput(question, (err, res) => {
            if (!err) {
                if (res.trim() != "") {
                    if (int) {
                        if (!isNaN(Number.parseInt(res))) {
                            prompt.emit("stop")
                            return resolve(Number.parseInt(res))
                        } else {
                            prompt.emit("stop")
                            return reject("No valid integer provided")
                        }
                    } else {
                        prompt.emit("stop")
                        return resolve(res.trim())
                    }
                } else {
                    prompt.emit("stop")
                    return reject("Empty input")
                }
            } else {
                prompt.emit("stop")
                return reject();
            }
        })
    });
}

async function flow() {
    try {
        console.log("Please enter your login details")
        let stripeKey = await getInput("Stripe secret key");
        console.log("Options")
        threadCount = await getInput("Thread count", true)
        stripe = require("stripe")(stripeKey);
        let urls = await getAllUrls();
        await downloadUrls(urls);
        console.log(`Downloaded ${urls.length} files`)
    } catch (error) {
        console.log(error)
    }
}

flow();