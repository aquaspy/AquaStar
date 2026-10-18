use serde_json::{json, Value};
use std::io::{self, Read};
use std::net::{IpAddr, ToSocketAddrs};
use std::time::Duration;

pub fn public_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, _, _] = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_multicast()
                || ip.is_unspecified()
                || ip.is_broadcast()
                || ip.is_documentation()
                || a == 0
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 198 && (b == 18 || b == 19))
                || (a == 192 && b == 0))
        }
        IpAddr::V6(ip) => {
            let bytes = ip.octets();
            // Accept ordinary global unicast only; exclude mapped IPv4 and transition ranges.
            bytes[0] & 0xe0 == 0x20
                && !(bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] < 0x20)
                && !(bytes[0] == 0x20 && bytes[1] == 0x02)
                && !(bytes[0..4] == [0x20, 0x01, 0x0d, 0xb8])
        }
    }
}

pub fn fetch(url: &str, origins: &[String]) -> Result<Value, String> {
    let parsed = tauri::Url::parse(url).map_err(|_| "Invalid URL")?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || !origins.contains(&parsed.origin().ascii_serialization())
    {
        return Err("HTTPS origin is not authorized".into());
    }
    let agent = ureq::AgentBuilder::new()
        .try_proxy_from_env(false)
        .redirects(0)
        .timeout(Duration::from_secs(15))
        .resolver(|address: &str| {
            let addresses: Vec<_> = address.to_socket_addrs()?.collect();
            if addresses.is_empty()
                || addresses
                    .iter()
                    .any(|address| !public_address(address.ip()))
            {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Public addresses only",
                ));
            }
            Ok(addresses)
        })
        .build();
    let response = match agent.get(parsed.as_str()).call() {
        Ok(response) | Err(ureq::Error::Status(_, response)) => response,
        Err(error) => return Err(error.to_string()),
    };
    if (300..400).contains(&response.status()) {
        return Err("Redirects are not supported; authorize the final URL".into());
    }
    let status = response.status();
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Response exceeds 2 MiB".into());
    }
    let body = String::from_utf8(bytes).map_err(|_| "Response is not UTF-8 text")?;
    Ok(json!({"status":status,"body":body}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_private_and_transition_destinations() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "198.18.0.1",
            "192.0.2.1",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "2001:db8::1",
            "2002:7f00:1::",
        ] {
            assert!(!public_address(address.parse().unwrap()), "{address}");
        }
        for address in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            assert!(public_address(address.parse().unwrap()), "{address}");
        }
    }
    #[test]
    fn rejects_ungranted_origins_before_network() {
        for url in [
            "http://example.com",
            "https://example.net",
            "https://user@example.com",
        ] {
            assert!(fetch(url, &["https://example.com".into()]).is_err());
        }
    }
}
