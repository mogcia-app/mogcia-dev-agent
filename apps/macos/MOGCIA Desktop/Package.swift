// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MOGCIADesktop",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "MOGCIADesktop", targets: ["MOGCIADesktop"])
    ],
    targets: [
        .executableTarget(
            name: "MOGCIADesktop",
            resources: [.process("Resources")]
        )
    ]
)
