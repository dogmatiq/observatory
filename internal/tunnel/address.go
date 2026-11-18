package tunnel

// The network and address that a node passes to [tenet.Client.Listen], and
// serves its gRPC server on. The Observatory dials them to reach the node.
//
// They only route a connection to the right listener of the node. Nothing is
// resolved or connected to at the address.
const (
	Network = "dogma"
	Address = "engine"
)
