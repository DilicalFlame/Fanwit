//! fanwit-install: see cli.rs. Embedded in every artefact; the generated NSIS, WiX, deb, rpm and
//! terminal glue only ever call this.

fn main() {
    let code = fanwit_install::cli::main(std::env::args().skip(1).collect(), vec![]);
    // Windows keeps the full 32 bit code; unix shells see the low byte (1603 -> 67)
    std::process::exit(code)
}
