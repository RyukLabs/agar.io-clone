module.exports = {
    host: "0.0.0.0",
    port: 3000,
    logpath: "logger.php",
    foodMass: 1,
    fireFood: 20,
    limitSplit: 16,
    defaultPlayerMass: 10,
	virus: {
        fill: "#33ff33",
        stroke: "#19D119",
        strokeWidth: 20,
        defaultMass: {
            from: 100,
            to: 150
        },
        splitMass: 180,
        uniformDisposition: false,
	},
    portal: {
        fill: "#ff0066",
        stroke: "#cc0044",
        strokeWidth: 25,
        defaultMass: {
            from: 72,
            to: 108
        },
        uniformDisposition: false,
        waveSpawnInterval: 10000,
        warningDuration: 3000,
        activeDuration: 5000,
        maxSimultaneous: 10,
    },
    gameWidth: 5000,
    gameHeight: 5000,
    adminPass: "DEFAULT",
    gameMass: 20000,
    maxFood: 1000,
    maxVirus: 50,
    maxPortal: 15,
    slowBase: 4.5,
    logChat: 0,
    networkUpdateFactor: 60,
    maxHeartbeatInterval: 600000,
    foodUniformDisposition: true,
    newPlayerInitialPosition: "farthest",
    massLossRate: 1,
    minMassLoss: 50,
    sqlinfo: {
      fileName: "db.sqlite3",
    }
};
