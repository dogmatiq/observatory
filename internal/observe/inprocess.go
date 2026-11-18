package observe

import (
	"context"
	"errors"
	"net"
	"sync"

	"google.golang.org/grpc/test/bufconn"
)

// InProcess returns a listener, and a [NodeDialer] that dials connections to
// it, for a node that runs in the same process as its caller, such as a fake
// engine in a test.
//
// The node serves its gRPC server on the listener. Once the listener is
// closed, Dial fails, and the NodeDialer ends when the last connection that it
// dialed closes.
func InProcess() (net.Listener, NodeDialer) {
	p := &inProcess{
		buffer: bufconn.Listen(inProcessBufferSize),
		done:   make(chan struct{}),
		conns:  map[*inProcessConn]struct{}{},
	}
	return &inProcessListener{p}, p
}

// inProcessBufferSize is the number of bytes that each in-process connection
// buffers in each direction.
const inProcessBufferSize = 256 * 1024

// errListenerClosed is the reason that an in-process [NodeDialer] gives for
// ending when the node has closed its listener.
var errListenerClosed = errors.New("the node closed its listener")

// inProcess is the [NodeDialer] that [InProcess] returns.
type inProcess struct {
	buffer *bufconn.Listener
	done   chan struct{}

	m              sync.Mutex
	listenerClosed bool
	err            error
	conns          map[*inProcessConn]struct{}
}

func (p *inProcess) Dial(ctx context.Context) (net.Conn, error) {
	p.m.Lock()
	err := p.err
	listenerClosed := p.listenerClosed
	p.m.Unlock()

	if err != nil {
		return nil, err
	}
	if listenerClosed {
		return nil, errListenerClosed
	}

	conn, err := p.buffer.DialContext(ctx)
	if err != nil {
		return nil, err
	}

	c := &inProcessConn{Conn: conn, dialer: p}

	p.m.Lock()
	defer p.m.Unlock()

	// The NodeDialer may have ended while the connection was being made.
	if p.err != nil {
		conn.Close()
		return nil, p.err
	}

	p.conns[c] = struct{}{}
	return c, nil
}

func (p *inProcess) Done() <-chan struct{} {
	return p.done
}

func (p *inProcess) Err() error {
	p.m.Lock()
	defer p.m.Unlock()
	return p.err
}

func (p *inProcess) Close() error {
	p.m.Lock()
	p.end(net.ErrClosed)
	conns := p.conns
	p.conns = nil
	p.m.Unlock()

	p.buffer.Close()

	// Closing the dialer's half of a connection also closes the listener's
	// half.
	for c := range conns {
		c.Conn.Close()
	}

	return nil
}

// closeListener stops new connections, and ends the NodeDialer if no
// connections remain.
func (p *inProcess) closeListener() {
	p.m.Lock()
	defer p.m.Unlock()

	if p.listenerClosed {
		return
	}

	p.listenerClosed = true
	p.buffer.Close()

	if len(p.conns) == 0 {
		p.end(errListenerClosed)
	}
}

// remove forgets a connection that has closed, and ends the NodeDialer if it
// was the last connection after the listener closed.
func (p *inProcess) remove(c *inProcessConn) {
	p.m.Lock()
	defer p.m.Unlock()

	delete(p.conns, c)

	if p.listenerClosed && len(p.conns) == 0 {
		p.end(errListenerClosed)
	}
}

// end records why the NodeDialer ended, and closes its done channel. It does
// nothing if the NodeDialer has already ended. p.m must be held.
func (p *inProcess) end(err error) {
	if p.err == nil {
		p.err = err
		close(p.done)
	}
}

// inProcessListener is the listener that [InProcess] returns.
type inProcessListener struct {
	dialer *inProcess
}

func (l *inProcessListener) Accept() (net.Conn, error) {
	return l.dialer.buffer.Accept()
}

func (l *inProcessListener) Addr() net.Addr {
	return l.dialer.buffer.Addr()
}

func (l *inProcessListener) Close() error {
	l.dialer.closeListener()
	return nil
}

// inProcessConn is the dialer's half of an in-process connection.
type inProcessConn struct {
	net.Conn
	dialer *inProcess
}

func (c *inProcessConn) Close() error {
	c.dialer.remove(c)
	return c.Conn.Close()
}
