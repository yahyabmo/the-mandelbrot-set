import numpy as np
import mpmath as mp
import matplotlib.pyplot as plt
from matplotlib import cm
import gmpy2 as mp

mp.get_context().precision=80

mp.dps=300
mp.prec=500
nini=150
L=[i for i in range(150)]+[i for i in range(150)][::-1]+[i for i in range(150)]+[i for i in range(99,150)]
fig, ax = plt.subplots()

def mandelbrot(max,z,maxit):
    i=0
    c=z
    while i<maxit and abs(z*z)<max:
        z=z*z+c
        i+=1
    i=L[i]
    return i

yahya=1080
bmo=1920

aspectratio=bmo/yahya
xRange=mp.mpfr('5.0')
yRange=xRange/aspectratio

x1=mp.mpfr('-1.78780638350855487198076170')
y1=mp.mpfr('0.00005689075511288150404139')
#4.741003658191226906631E-17


#x1=mp.mpfr('0.0')
#y1=mp.mpfr('0.0')


turbo=plt.get_cmap('turbo',150) 

def zoomcontinue(x1,y1):
    mx=xRange/(mp.mpfr(bmo)-1)
    my=yRange/(mp.mpfr(yahya)-1)

    mapper = lambda x,y : mp.mpc(x1 -xRange/2 + x*mx , y1 -yRange/2 + y*my)
    
    lmatrisa=[[0 for i in range(bmo)] for j in range(yahya)]
    
    for i in range(yahya):
        for j in range(bmo):
            lmatrisa[i][j]=turbo(mandelbrot(4,mapper(mp.mpfr(str(j)),mp.mpfr(str(i))),500))

    return np.array(lmatrisa)


    

def mouse_move(event):
    x, y = event.xdata, event.ydata
    print(x, y)

#plt.connect('motion_notify_event', mouse_move)

x=3488

for i in range(x-1):
    xRange/=mp.mpfr('1.01199087123')
    yRange/=mp.mpfr('1.01199087123')

c=8
for i in range(x,3518,c):
    
    for j in range(c):
        xRange/=mp.mpfr('1.01199087123')
        yRange/=mp.mpfr('1.01199087123')
    
    img=zoomcontinue(x1,y1)
    plt.imsave('img{0}.png'.format(i),img)
    print(i ,"is done")

#plt.imshow(img,cmap=turbo)
#plt.title("mandelbrot")
#plt.show()



